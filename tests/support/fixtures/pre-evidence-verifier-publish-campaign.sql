-- Prior publish RPC retained as a database integration-test fixture.
CREATE FUNCTION public.publish_campaign_with_project(p_campaign_id uuid, p_company_user_id integer, p_actor_user_id integer, p_title text, p_description text, p_category text, p_location text, p_budget_inr numeric, p_budget_breakdown jsonb, p_schedule_vii text, p_sdg_alignment integer[], p_lead_ngo_user_id integer, p_impact_metrics jsonb, p_milestones jsonb, p_start_date date, p_end_date date, p_region text, p_total_budget numeric, p_expected_beneficiaries integer, p_published_at timestamp with time zone, p_campaign_url text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_campaign public.campaigns%ROWTYPE;
  v_project public.csr_projects%ROWTYPE;
  v_status_at_lock text;
  v_created boolean := false;
  v_repaired boolean := false;
  v_milestones_created integer := 0;
  v_milestone jsonb;
  v_ord integer;
  v_title text;
  v_description text;
  v_amount numeric;
  v_due date;
  v_evidence jsonb;
  v_publish_hash text;
  v_project_hash text;
  v_repair_hash text;
  v_outcome text;
  v_updated integer;
  v_expected_count integer := 0;
  v_dup_order integer;
  v_existing_for_order integer;
  v_lead_accepted boolean;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_argument', 'error', 'campaign_id is required');
  END IF;

  IF p_company_user_id IS NULL OR p_company_user_id <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_argument', 'error', 'A company owner is required to publish the campaign');
  END IF;

  IF p_lead_ngo_user_id IS NULL OR p_lead_ngo_user_id <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_argument', 'error', 'A lead NGO is required to create the CSR project');
  END IF;

  IF p_end_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_argument', 'error', 'Campaign end_date is required');
  END IF;

  IF p_milestones IS NOT NULL AND jsonb_typeof(p_milestones) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_milestones', 'error', 'milestones must be a JSON array');
  END IF;

  -- Validate milestone amounts before any writes. Never coerce non-numeric values to zero.
  IF jsonb_typeof(coalesce(p_milestones, '[]'::jsonb)) = 'array' THEN
    FOR v_milestone, v_ord IN
      SELECT value, ord::integer
      FROM jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ORDER BY ord
    LOOP
      IF (v_milestone ? 'budget_allocated') AND nullif(trim(coalesce(v_milestone->>'budget_allocated', '')), '') IS NOT NULL THEN
        BEGIN
          v_amount := (v_milestone->>'budget_allocated')::numeric;
        EXCEPTION
          WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_milestone_amount', 'error', format('Milestone %s budget_allocated is not numeric', v_ord));
        END;
        IF v_amount < 0 THEN
          RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_milestone_amount', 'error', format('Milestone %s budget_allocated must be non-negative', v_ord));
        END IF;
      ELSIF (v_milestone ? 'amount') AND nullif(trim(coalesce(v_milestone->>'amount', '')), '') IS NOT NULL THEN
        BEGIN
          v_amount := (v_milestone->>'amount')::numeric;
        EXCEPTION
          WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_milestone_amount', 'error', format('Milestone %s amount is not numeric', v_ord));
        END;
        IF v_amount < 0 THEN
          RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_milestone_amount', 'error', format('Milestone %s amount must be non-negative', v_ord));
        END IF;
      END IF;
    END LOOP;
    v_expected_count := coalesce(jsonb_array_length(p_milestones), 0);
  END IF;

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_found', 'error', 'Campaign not found');
  END IF;

  IF v_campaign.company_id IS DISTINCT FROM p_company_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'forbidden', 'error', 'Campaign not found');
  END IF;

  v_status_at_lock := lower(v_campaign.status::text);

  IF v_status_at_lock NOT IN ('draft', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_state', 'error', 'Only draft or active campaigns can be published or repaired');
  END IF;

  -- Lead NGO must already be accepted on the stored campaign (not only in the client payload).
  IF v_campaign.lead_ngo_user_id IS NULL OR v_campaign.lead_ngo_user_id <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'lead_ngo_required', 'error', 'A lead NGO must accept the invite before this campaign can be published');
  END IF;

  IF v_campaign.lead_ngo_user_id IS DISTINCT FROM p_lead_ngo_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'lead_ngo_mismatch', 'error', 'lead_ngo_user_id does not match the campaign lead NGO');
  END IF;

  BEGIN
    v_lead_accepted := coalesce((v_campaign.impact_metrics->>'lead_ngo_accepted')::boolean, false);
  EXCEPTION
    WHEN others THEN
      v_lead_accepted := false;
  END;

  IF NOT v_lead_accepted THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'lead_ngo_not_accepted', 'error', 'A lead NGO must accept the invite from their dashboard before this campaign can be published');
  END IF;

  -- Draft → active publish updates campaign fields. Active repair/ensure never overwrites campaign data.
  IF v_status_at_lock = 'draft' THEN
    UPDATE public.campaigns
    SET
      title = coalesce(nullif(trim(p_title), ''), title),
      description = p_description,
      category = coalesce(nullif(trim(p_category), ''), category),
      location = coalesce(nullif(trim(p_location), ''), location),
      budget_inr = p_budget_inr,
      budget_breakdown = coalesce(p_budget_breakdown, '{}'::jsonb),
      schedule_vii = p_schedule_vii,
      sdg_alignment = coalesce(p_sdg_alignment, '{}'::integer[]),
      lead_ngo_user_id = p_lead_ngo_user_id,
      impact_metrics = coalesce(p_impact_metrics, '{}'::jsonb),
      milestones = coalesce(p_milestones, '[]'::jsonb),
      start_date = p_start_date,
      end_date = p_end_date,
      status = 'active',
      updated_at = now()
    WHERE id = p_campaign_id
      AND lower(status::text) = 'draft';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_state', 'error', 'Only draft campaigns can be published');
    END IF;

    SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  END IF;

  SELECT * INTO v_project
  FROM public.csr_projects
  WHERE campaign_id = p_campaign_id
  ORDER BY created_at NULLS LAST, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.csr_projects (
        campaign_id,
        company_user_id,
        ngo_user_id,
        title,
        description,
        region,
        project_status,
        acceptance_date,
        start_date,
        end_date,
        total_budget,
        funds_utilized,
        progress_percentage,
        expected_beneficiaries,
        metadata
      ) VALUES (
        p_campaign_id,
        p_company_user_id,
        p_lead_ngo_user_id,
        coalesce(nullif(trim(p_title), ''), coalesce(v_campaign.title, 'CSR Project')),
        coalesce(p_description, v_campaign.description),
        coalesce(p_region, nullif(trim(coalesce(v_campaign.location, '')), '')),
        'active',
        coalesce(p_published_at, now()),
        coalesce(p_start_date, v_campaign.start_date),
        coalesce(p_end_date, v_campaign.end_date),
        coalesce(p_total_budget, v_campaign.budget_inr),
        0,
        0,
        p_expected_beneficiaries,
        jsonb_build_object(
          'source', CASE WHEN v_status_at_lock = 'active' THEN 'campaign_repair' ELSE 'campaign_publish' END,
          'created_from_campaign_id', p_campaign_id,
          'published_at', coalesce(p_published_at, now())
        )
      )
      RETURNING * INTO v_project;

      v_created := true;
      IF v_status_at_lock = 'active' THEN
        v_repaired := true;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_project
        FROM public.csr_projects
        WHERE campaign_id = p_campaign_id
        ORDER BY created_at NULLS LAST, id
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE;
        END IF;
        v_created := false;
        v_repaired := false;
    END;
  END IF;

  -- Conflicting duplicate milestone orders already in DB cannot be safely reconciled.
  SELECT m.milestone_order INTO v_dup_order
  FROM public.csr_project_milestones m
  WHERE m.project_id = v_project.id
  GROUP BY m.milestone_order
  HAVING count(*) > 1
  ORDER BY m.milestone_order
  LIMIT 1;

  IF v_dup_order IS NOT NULL THEN
    -- RAISE so prior draft→active / project inserts in this transaction roll back.
    RAISE EXCEPTION 'PUBLISH_ERROR:milestone_conflict:Project has duplicate milestone_order=%', v_dup_order
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert only missing orders from the expected campaign milestone list. Never update existing rows.
  IF v_expected_count > 0 THEN
    FOR v_milestone, v_ord IN
      SELECT value, ord::integer
      FROM jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ORDER BY ord
    LOOP
      SELECT count(*)::integer INTO v_existing_for_order
      FROM public.csr_project_milestones
      WHERE project_id = v_project.id
        AND milestone_order = v_ord;

      IF v_existing_for_order > 1 THEN
        RAISE EXCEPTION 'PUBLISH_ERROR:milestone_conflict:Project has duplicate milestone_order=%', v_ord
          USING ERRCODE = 'P0001';
      END IF;

      IF v_existing_for_order = 1 THEN
        CONTINUE;
      END IF;

      v_title := nullif(trim(coalesce(v_milestone->>'title', '')), '');
      IF v_title IS NULL THEN
        v_title := format('Milestone %s', v_ord);
      END IF;
      v_description := nullif(trim(coalesce(v_milestone->>'description', '')), '');

      IF (v_milestone ? 'budget_allocated') AND nullif(trim(coalesce(v_milestone->>'budget_allocated', '')), '') IS NOT NULL THEN
        v_amount := (v_milestone->>'budget_allocated')::numeric;
      ELSIF (v_milestone ? 'amount') AND nullif(trim(coalesce(v_milestone->>'amount', '')), '') IS NOT NULL THEN
        v_amount := (v_milestone->>'amount')::numeric;
      ELSE
        v_amount := 0;
      END IF;

      BEGIN
        v_due := coalesce(
          nullif(v_milestone->>'due_date', '')::date,
          nullif(v_milestone->>'end_date', '')::date
        );
      EXCEPTION
        WHEN others THEN
          RAISE EXCEPTION 'PUBLISH_ERROR:invalid_milestone_date:Milestone % has an invalid due/end date', v_ord
            USING ERRCODE = 'P0001';
      END;

      IF jsonb_typeof(v_milestone->'evidence_requirements') = 'array' THEN
        v_evidence := v_milestone->'evidence_requirements';
      ELSIF jsonb_typeof(v_milestone->'deliverables') = 'array' THEN
        v_evidence := v_milestone->'deliverables';
      ELSE
        v_evidence := '[]'::jsonb;
      END IF;

      BEGIN
        INSERT INTO public.csr_project_milestones (
          project_id,
          campaign_id,
          title,
          description,
          milestone_order,
          amount,
          evidence_requirements,
          due_date,
          company_approval_required,
          status
        ) VALUES (
          v_project.id,
          p_campaign_id,
          v_title,
          v_description,
          v_ord,
          v_amount,
          v_evidence,
          v_due,
          true,
          'pending'
        );
        v_milestones_created := v_milestones_created + 1;
      EXCEPTION
        WHEN unique_violation THEN
          -- Concurrent reconciler inserted this order first; leave existing row untouched.
          NULL;
      END;
    END LOOP;
  END IF;

  v_publish_hash := 'campaign_published:' || p_campaign_id::text;
  v_project_hash := 'csr_project_created_on_publish:' || v_project.id::text;
  v_repair_hash := 'campaign_publish_repaired:' || p_campaign_id::text;

  IF v_repaired THEN
    IF NOT EXISTS (SELECT 1 FROM public.csr_audit_log WHERE event_hash = v_repair_hash) THEN
      INSERT INTO public.csr_audit_log (
        entity_type, entity_id, event_type, event_hash, event_payload, created_by
      ) VALUES (
        'campaign',
        p_campaign_id,
        'campaign_publish_repaired',
        v_repair_hash,
        jsonb_build_object(
          'csr_project_id', v_project.id,
          'csr_project_created', v_created,
          'milestones_created', v_milestones_created,
          'repaired', true
        ),
        p_actor_user_id
      );
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.csr_audit_log WHERE event_hash = v_publish_hash) THEN
    INSERT INTO public.csr_audit_log (
      entity_type, entity_id, event_type, event_hash, event_payload, created_by
    ) VALUES (
      'campaign',
      p_campaign_id,
      'campaign_published',
      v_publish_hash,
      jsonb_build_object(
        'title', v_campaign.title,
        'category', v_campaign.category,
        'location', v_campaign.location,
        'campaign_url', p_campaign_url,
        'csr_project_id', v_project.id,
        'csr_project_created', v_created,
        'milestones_created', v_milestones_created,
        'repaired', v_repaired
      ),
      p_actor_user_id
    );
  END IF;

  IF v_created AND NOT EXISTS (SELECT 1 FROM public.csr_audit_log WHERE event_hash = v_project_hash) THEN
    INSERT INTO public.csr_audit_log (
      entity_type, entity_id, event_type, event_hash, event_payload, created_by
    ) VALUES (
      'csr_project',
      v_project.id,
      'csr_project_created_on_publish',
      v_project_hash,
      jsonb_build_object(
        'campaign_id', p_campaign_id,
        'ngo_user_id', p_lead_ngo_user_id,
        'company_user_id', p_company_user_id,
        'milestone_count', v_milestones_created,
        'repaired', v_repaired
      ),
      p_actor_user_id
    );
  END IF;

  IF v_repaired THEN
    v_outcome := 'repaired_active_without_project';
  ELSIF v_created THEN
    v_outcome := 'published';
  ELSIF v_milestones_created > 0 THEN
    v_outcome := 'milestones_reconciled';
  ELSE
    v_outcome := 'already_published';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'project_id', v_project.id,
    'created', v_created,
    'repaired', v_repaired,
    'milestones_created', v_milestones_created,
    'campaign_id', p_campaign_id,
    'campaign_status', lower(v_campaign.status::text)
  );
END;
$$;
