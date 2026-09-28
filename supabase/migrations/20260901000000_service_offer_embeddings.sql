-- Semantic search over service offers, used by /api/service-requests/recommend.
-- The column has no fixed dimension so the embed model can change; the match
-- function only compares vectors of the same length as the query.

create extension if not exists vector;

create table if not exists public.service_offer_embeddings (
  service_offer_id integer not null,
  embedding vector not null,
  content_hash text not null,
  updated_at timestamp with time zone not null default now(),
  constraint service_offer_embeddings_pkey primary key (service_offer_id),
  constraint service_offer_embeddings_service_offer_id_fkey
    foreign key (service_offer_id) references public.service_offers(id) on delete cascade
);

alter table public.service_offer_embeddings enable row level security;

create or replace function public.match_service_offers(
  query_embedding vector,
  match_count integer default 50
)
returns table (service_offer_id integer, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select e.service_offer_id, 1 - (e.embedding <=> query_embedding) as similarity
  from public.service_offer_embeddings e
  join public.service_offers o on o.id = e.service_offer_id
  where o.status = 'active'
    and vector_dims(e.embedding) = vector_dims(query_embedding)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
