import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { socialFeedDb } from '@/lib/social-feed-db';
import { assertAdminUser } from '@/lib/admin-auth';

const extractHashtags = (content: unknown) => {
  const text = String(content || '');
  return text.match(/#([a-zA-Z0-9_]+)/g)?.map((tag) => tag.replace('#', '').toLowerCase()) || [];
};

const normalizeTags = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean);
  }

  return [] as string[];
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertAdminUser(request);
    const { postId } = await params;

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:users!author_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .eq('id', postId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({ success: true, post: data || null });
  } catch (error: any) {
    console.error('Admin post fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertAdminUser(request);
    const { postId } = await params;
    const body = await request.json();

    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('id, content, tags')
      .eq('id', postId)
      .single();

    if (fetchError) throw fetchError;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.content !== undefined) {
      updatePayload.content = String(body.content || '').trim();
    }

    if (body.category !== undefined) {
      updatePayload.category = String(body.category || '').trim();
    }

    if (body.visibility !== undefined) {
      updatePayload.visibility = String(body.visibility || '').trim();
    }

    if (body.location !== undefined) {
      updatePayload.location = String(body.location || '').trim() || null;
    }

    if (body.media_urls !== undefined) {
      updatePayload.media_urls = Array.isArray(body.media_urls) ? body.media_urls : [];
    }

    const explicitTags = normalizeTags(body.tags);
    const contentTags = body.content !== undefined ? extractHashtags(body.content) : [];
    const mergedTags = Array.from(new Set([...explicitTags, ...contentTags]));
    if (body.tags !== undefined || body.content !== undefined) {
      updatePayload.tags = mergedTags;
    }

    const { data, error } = await supabase
      .from('posts')
      .update(updatePayload)
      .eq('id', postId)
      .select(`
        *,
        author:users!author_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .single();

    if (error) throw error;

    const oldTags = Array.isArray(existingPost?.tags)
      ? existingPost.tags
      : typeof existingPost?.tags === 'string'
        ? normalizeTags(existingPost.tags)
        : [];

    if (body.content !== undefined || body.tags !== undefined) {
      const hashtagsToDecrement = oldTags.filter((tag: string) => !mergedTags.includes(tag));
      const hashtagsToIncrement = mergedTags.filter((tag: string) => !oldTags.includes(tag));

      if (hashtagsToDecrement.length > 0) {
        await socialFeedDb.posts.decrementHashtagStats(hashtagsToDecrement);
      }

      if (hashtagsToIncrement.length > 0) {
        await socialFeedDb.posts.updateHashtagStats(hashtagsToIncrement);
      }
    }

    return NextResponse.json({ success: true, post: data });
  } catch (error: any) {
    console.error('Admin post update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    assertAdminUser(request);
    const { postId } = await params;

    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('id, content, tags')
      .eq('id', postId)
      .single();

    if (fetchError) throw fetchError;

    const hashtags = Array.isArray(existingPost?.tags)
      ? existingPost.tags
      : typeof existingPost?.tags === 'string'
        ? normalizeTags(existingPost.tags)
        : extractHashtags(existingPost?.content);

    await Promise.all([
      supabase.from('post_comments').delete().eq('post_id', postId),
      supabase.from('post_reactions').delete().eq('post_id', postId),
      supabase.from('post_interactions').delete().eq('post_id', postId),
    ]);

    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;

    if (hashtags.length > 0) {
      await socialFeedDb.posts.decrementHashtagStats(hashtags);
    }

    return NextResponse.json({ success: true, message: 'Post deleted successfully' });
  } catch (error: any) {
    console.error('Admin post delete error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}