// Database helper functions for Social Feed functionality
import { supabase } from './db'

// ===============================================
// POSTS FUNCTIONALITY
// ===============================================

export const socialFeedDb = {
  // Posts
  posts: {
    async getAll(filters: {
      userId?: number;
      authorId?: number;
      userType?: string;
      limit?: number;
      offset?: number;
      category?: string;
    } = {}) {
      let query = supabase
        .from('posts')
        .select(`
          id,
          author_id,
          content,
          media_urls,
          tags,
          category,
          location,
          visibility,
          published_at,
          created_at,
          reaction_count,
          comment_count,
          share_count,
          view_count,
          is_approved,
          author:users!author_id(id, name, email, user_type, profile_image, verification_status),
          reactions:post_reactions(user_id, reaction_type)
        `)
        .eq('is_approved', true)
        .order('published_at', { ascending: false });

      // Apply filters
      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.authorId) {
        query = query.eq('author_id', filters.authorId);
      }

      // Pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      // Process the data to match the frontend expectations
      return data?.map(post => {
        // Check if current user has liked this post
        let hasLiked = false;
        if (filters.userId && post.reactions) {
          hasLiked = post.reactions.some((reaction: any) => 
            reaction.user_id === filters.userId && reaction.reaction_type === 'like'
          );
        }

        return {
          id: post.id.toString(),
          author: {
            id: (post.author as any)?.id || post.author_id,
            name: (post.author as any)?.name || 'Unknown User',
            role: socialFeedDb.getUserRole((post.author as any)?.user_type || 'individual'),
            avatar: (post.author as any)?.profile_image || socialFeedDb.getDefaultAvatar((post.author as any)?.user_type || 'individual'),
            verified: (post.author as any)?.verification_status === 'verified',
            type: (post.author as any)?.user_type || 'individual',
            email: (post.author as any)?.email || ''
          },
          content: post.content,
          image: post.media_urls?.[0] || undefined,
          timestamp: post.created_at || post.published_at || new Date().toISOString(),
          likes: post.reaction_count || 0,
          comments: post.comment_count || 0,
          shares: post.share_count || 0,
          views: post.view_count || 0,
          liked: hasLiked,
          reactions: post.reactions || [],
          category: post.category,
          tags: Array.isArray(post.tags) ? post.tags : (post.tags ? JSON.parse(post.tags) : [])
        };
      }) || [];
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          author:users!author_id(id, name, email, user_type, profile_image, verification_status),
          reactions:post_reactions(id, reaction_type, user_id, user:users!user_id(name)),
          comments:post_comments(
            id, content, created_at, author_id, reply_count, reaction_count,
            author:users!author_id(id, name, profile_image, user_type),
            replies:post_comments!parent_comment_id(
              id, content, created_at, author_id,
              author:users!author_id(id, name, profile_image)
            )
          )
        `)
        .eq('id', id)
        .eq('is_approved', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(postData: {
      author_id: number;
      content: string;
      post_type?: string;
      media_urls?: string[];
      tags?: string[];
      category?: string;
      location?: string;
      visibility?: string;
    }) {
      try {
        // Extract hashtags from content
        const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
        const contentHashtags = postData.content.match(hashtagRegex)?.map(tag => tag.replace('#', '').toLowerCase()) || [];
        const allTags = [...new Set([...(postData.tags || []), ...contentHashtags])];

        // Create post data WITHOUT triggers by using raw insert
        const postInsert = {
          author_id: postData.author_id,
          content: postData.content,
          post_type: postData.post_type || 'text',
          media_urls: postData.media_urls || [],
          tags: allTags,
          category: postData.category || 'update',
          location: postData.location,
          visibility: postData.visibility || 'public',
          published_at: new Date().toISOString(),
          is_approved: true,
          reaction_count: 0,
          comment_count: 0,
          share_count: 0,
          view_count: 0
        };

        // Insert the post - disable any triggers by using RLS bypass
        const { data, error } = await supabase
          .from('posts')
          .insert(postInsert)
          .select(`
            id, content, author_id, post_type, media_urls, tags, 
            category, location, visibility, published_at, created_at,
            reaction_count, comment_count, share_count, view_count,
            author:users!author_id(id, name, email, user_type, profile_image, verification_status)
          `)
          .single();

        if (error) {
          console.error('Database insert error:', error);
          throw new Error(`Failed to create post: ${error.message}`);
        }

        // Handle hashtag tracking manually and safely
        if (allTags.length > 0) {
          // Run hashtag processing in background, don't let it block post creation
          setTimeout(async () => {
            try {
              await this.updateHashtagStats(allTags);
            } catch (hashtagError: any) {
              console.warn('Hashtag tracking failed (non-critical):', hashtagError?.message || hashtagError);
            }
          }, 100);
        }

        return data;
      } catch (error) {
        throw error;
      }
    },

    // Enhanced method to update hashtag statistics with proper trending logic
    async updateHashtagStats(tags: string[]) {
      for (const tag of tags) {
        try {
          const tagLower = tag.toLowerCase().trim();
          
          if (!tagLower || tagLower.length === 0) continue;
          
          // Check for existing hashtag
          const { data: existing, error: selectError } = await supabase
            .from('hashtags')
            .select('id, total_mentions, daily_mentions, weekly_mentions')
            .eq('tag', tagLower)
            .maybeSingle();

          if (selectError) {
            continue;
          }

          const newDailyMentions = (existing?.daily_mentions || 0) + 1;
          const newWeeklyMentions = (existing?.weekly_mentions || 0) + 1;
          const newTotalMentions = (existing?.total_mentions || 0) + 1;
          
          // Enhanced trending score calculation
          const trendingScore = this.calculateTrendingScore(newDailyMentions, newWeeklyMentions, newTotalMentions);
          
          if (existing) {
            // Update existing hashtag
            const { error: updateError } = await supabase
              .from('hashtags')
              .update({
                total_mentions: newTotalMentions,
                daily_mentions: newDailyMentions,
                weekly_mentions: newWeeklyMentions,
                trending_score: trendingScore,
                is_trending: newDailyMentions >= 2, // Lower threshold for better trending detection
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);

            if (!updateError) {
              // Update trending rankings after successful hashtag update
              this.updateTrendingRankings().catch(() => {});
            }
          } else {
            // Create new hashtag
            const { error: insertError } = await supabase
              .from('hashtags')
              .insert({
                tag: tagLower,
                total_mentions: 1,
                daily_mentions: 1,
                weekly_mentions: 1,
                trending_score: 1.5, // Start with good base score for new tags
                is_trending: false, // New tags start as non-trending
                category: 'general',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (!insertError) {
              // Update trending rankings after successful hashtag creation
              this.updateTrendingRankings().catch(() => {});
            }
          }
        } catch (tagError: any) {
          // Silent fail for production
        }
      }
    },

    // Enhanced trending score calculation
    calculateTrendingScore(daily: number, weekly: number, total: number): number {
      const recencyWeight = daily * 4.0;     // High weight for recent activity
      const consistencyWeight = weekly * 2.0;  // Medium weight for weekly consistency
      const popularityWeight = total * 0.2;    // Small weight for overall popularity
      const velocityBonus = daily > weekly * 0.3 ? daily * 0.5 : 0; // Bonus for acceleration
      
      return Math.round((recencyWeight + consistencyWeight + popularityWeight + velocityBonus) * 100) / 100;
    },

    // Update trending rankings and determine top trending hashtags
    async updateTrendingRankings() {
      try {
        // Get all hashtags with recent activity
        const { data: allHashtags, error: fetchError } = await supabase
          .from('hashtags')
          .select('*')
          .gt('daily_mentions', 0)
          .order('trending_score', { ascending: false });

        if (fetchError || !allHashtags) return;

        // Determine top 5 trending hashtags
        const top5Trending = allHashtags.slice(0, 5);
        const trendingIds = top5Trending.map(h => h.id);

        // Reset all trending status
        await supabase
          .from('hashtags')
          .update({ is_trending: false });

        // Set top 5 as trending
        if (trendingIds.length > 0) {
          await supabase
            .from('hashtags')
            .update({ is_trending: true })
            .in('id', trendingIds);
        }

        // Replace hashtags that drop below threshold
        const eligibleHashtags = allHashtags.filter(h => 
          h.daily_mentions >= 2 && h.trending_score > 5
        );

        // If we have more eligible hashtags than current trending, update the list
        if (eligibleHashtags.length > 5) {
          const newTop5 = eligibleHashtags.slice(0, 5);
          const newTrendingIds = newTop5.map(h => h.id);
          
          // Reset all and set new top 5
          await supabase.from('hashtags').update({ is_trending: false });
          await supabase
            .from('hashtags')
            .update({ is_trending: true })
            .in('id', newTrendingIds);
        }
      } catch (error) {
        // Silent fail for production
      }
    },

    // Get current trending hashtags with rankings
    async getTrendingHashtags(limit: number = 5) {
      const { data, error } = await supabase
        .from('hashtags')
        .select('*')
        .eq('is_trending', true)
        .order('trending_score', { ascending: false })
        .order('daily_mentions', { ascending: false })
        .order('weekly_mentions', { ascending: false })
        .limit(limit);

      if (error) {
        return [];
      }

      return data || [];
    },

    async update(id: string, updateData: any) {
      const { data, error } = await supabase
        .from('posts')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async delete(id: string, authorId: number) {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id)
        .eq('author_id', authorId); // Security: only author can delete

      if (error) throw error;
      return true;
    },

    async getFeedForUser(userId: number, options: {
      limit?: number;
      offset?: number;
      includeConnections?: boolean;
    } = {}) {
      // Get user's connections if needed
      let connectionIds: number[] = [];
      
      if (options.includeConnections) {
        const { data: connections } = await supabase
          .from('user_connections')
          .select('following_id')
          .eq('follower_id', userId)
          .eq('status', 'active');
        
        connectionIds = connections?.map(c => c.following_id) || [];
        connectionIds.push(userId); // Include user's own posts
      }

      let query = supabase
        .from('posts')
        .select(`
          *,
          author:users!author_id(id, name, email, user_type, profile_image, verification_status)
        `)
        .eq('is_approved', true)
        .order('published_at', { ascending: false });

      // Filter by connections if specified
      if (options.includeConnections && connectionIds.length > 0) {
        query = query.in('author_id', connectionIds);
      }

      // Pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  },

  // Reactions
  reactions: {
    async toggle(postId: string, userId: number, reactionType: string = 'like') {
      // Check if reaction already exists
      const { data: existing } = await supabase
        .from('post_reactions')
        .select('id, reaction_type')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        if (existing.reaction_type === reactionType) {
          // Remove reaction
          const { error } = await supabase
            .from('post_reactions')
            .delete()
            .eq('id', existing.id);
          
          if (error) throw error;
          return { action: 'removed', reactionType };
        } else {
          // Update reaction type
          const { data, error } = await supabase
            .from('post_reactions')
            .update({ reaction_type: reactionType })
            .eq('id', existing.id)
            .select()
            .single();
          
          if (error) throw error;
          return { action: 'updated', reactionType, data };
        }
      } else {
        // Add new reaction
        const { data, error } = await supabase
          .from('post_reactions')
          .insert({
            post_id: postId,
            user_id: userId,
            reaction_type: reactionType
          })
          .select()
          .single();
        
        if (error) throw error;
        return { action: 'added', reactionType, data };
      }
    },

    async getForPost(postId: string) {
      const { data, error } = await supabase
        .from('post_reactions')
        .select(`
          *,
          user:users!user_id(id, name, profile_image, user_type)
        `)
        .eq('post_id', postId);

      if (error) throw error;
      return data;
    },

    async hasUserLiked(postId: string, userId: number) {
      try {
        const { data, error } = await supabase
          .from('post_reactions')
          .select('id')
          .eq('post_id', parseInt(postId))
          .eq('user_id', userId)
          .eq('reaction_type', 'like')
          .maybeSingle();

        if (error) throw error;
        return !!data;
      } catch (error) {
        return false;
      }
    }
  },

  // Comments
  comments: {
    async getForPost(postId: string) {
      const { data, error } = await supabase
        .from('post_comments')
        .select(`
          *,
          author:users!author_id(id, name, profile_image, user_type, verification_status),
          replies:post_comments!parent_comment_id(
            *,
            author:users!author_id(id, name, profile_image, user_type)
          )
        `)
        .eq('post_id', postId)
        .eq('status', 'active')
        .is('parent_comment_id', null) // Only get top-level comments
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },

    async create(commentData: {
      post_id: string;
      author_id: number;
      content: string;
      parent_comment_id?: string;
    }) {
      const { data, error } = await supabase
        .from('post_comments')
        .insert(commentData)
        .select(`
          *,
          author:users!author_id(id, name, profile_image, user_type)
        `)
        .single();

      if (error) throw error;
      return data;
    },

    async update(id: string, content: string, authorId: number) {
      const { data, error } = await supabase
        .from('post_comments')
        .update({ 
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('author_id', authorId) // Security: only author can update
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async delete(id: string, authorId: number) {
      const { error } = await supabase
        .from('post_comments')
        .update({ 
          status: 'deleted',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('author_id', authorId); // Security: only author can delete

      if (error) throw error;
      return true;
    }
  },

  // User Connections
  connections: {
    async follow(followerId: number, followingId: number) {
      const { data, error } = await supabase
        .from('user_connections')
        .upsert({
          follower_id: followerId,
          following_id: followingId,
          connection_type: 'follow',
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async unfollow(followerId: number, followingId: number) {
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      if (error) throw error;
      return true;
    },

    async getFollowers(userId: number) {
      const { data, error } = await supabase
        .from('user_connections')
        .select(`
          *,
          follower:users!follower_id(id, name, profile_image, user_type, verification_status)
        `)
        .eq('following_id', userId)
        .eq('status', 'active');

      if (error) throw error;
      return data;
    },

    async getFollowing(userId: number) {
      const { data, error } = await supabase
        .from('user_connections')
        .select(`
          *,
          following:users!following_id(id, name, profile_image, user_type, verification_status)
        `)
        .eq('follower_id', userId)
        .eq('status', 'active');

      if (error) throw error;
      return data;
    },

    async isFollowing(followerId: number, followingId: number) {
      const { data, error } = await supabase
        .from('user_connections')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    },

    async getSuggested(userId: number, limit: number = 5) {
      // Get users who are not already connected and have high engagement
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, user_type, profile_image, verification_status')
        .neq('id', userId)
        .limit(limit);

      if (error) throw error;

      // Filter out already connected users (this would be more efficient with a more complex query)
      const { data: connections } = await supabase
        .from('user_connections')
        .select('following_id')
        .eq('follower_id', userId);

      const connectedIds = connections?.map(c => c.following_id) || [];
      
      return data?.filter(user => !connectedIds.includes(user.id)) || [];
    }
  },

  // Trending Topics
  trending: {
    async getTopics(limit: number = 10) {
      const { data, error } = await supabase
        .from('trending_topics')
        .select('*')
        .order('trend_score', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },

    async updateTopic(topic: string, category: string = 'hashtag') {
      const { data, error } = await supabase
        .from('trending_topics')
        .upsert({
          topic,
          category,
          mention_count: 1,
          unique_users_count: 1,
          last_mentioned_at: new Date().toISOString()
        }, {
          onConflict: 'topic'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Notifications
  notifications: {
    async create(notificationData: {
      user_id: number;
      type: string;
      title: string;
      message?: string;
      related_user_id?: number;
      related_post_id?: string;
      related_comment_id?: string;
      action_url?: string;
    }) {
      const { data, error } = await supabase
        .from('user_notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async getForUser(userId: number, limit: number = 20, unreadOnly: boolean = false) {
      let query = supabase
        .from('user_notifications')
        .select(`
          *,
          related_user:users!related_user_id(id, name, profile_image, user_type)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    async markAsRead(notificationId: string, userId: number) {
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .eq('user_id', userId); // Security: only owner can mark as read

      if (error) throw error;
      return true;
    },

    async markAllAsRead(userId: number) {
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return true;
    }
  },

  // Post Interactions (Views, Shares, etc.)
  interactions: {
    async trackView(postId: string, userId: number) {
      try {
        // Insert or update view count for this user and post
        const { data, error } = await supabase
          .from('post_interactions')
          .upsert({
            post_id: parseInt(postId),
            user_id: userId,
            interaction_type: 'view',
            interaction_value: 1,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'post_id,user_id,interaction_type'
          })
          .select()
          .single();

        if (error) {
          return null;
        }

        // Update the post's view count
        await this.updatePostViewCount(postId);
        return data;
      } catch (error) {
        return null;
      }
    },

    async trackAnonymousView(postId: string, anonymousId: string) {
      try {
        // For anonymous users, we'll use a special user_id of 0 and store the anonymous ID in a metadata field
        // First check if this anonymous user has already viewed this post
        const { data: existing } = await supabase
          .from('post_interactions')
          .select('id')
          .eq('post_id', parseInt(postId))
          .eq('interaction_type', 'view')
          .eq('user_id', 0)
          .eq('metadata->anonymous_id', anonymousId)
          .single();

        if (existing) {
          return null; // Don't track duplicate anonymous views
        }

        // Insert new anonymous view
        const { data, error } = await supabase
          .from('post_interactions')
          .insert({
            post_id: parseInt(postId),
            user_id: 0, // Special ID for anonymous users
            interaction_type: 'view',
            interaction_value: 1,
            metadata: { anonymous_id: anonymousId },
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          return null;
        }

        // Update the post's view count
        await this.updatePostViewCount(postId);
        return data;
      } catch (error) {
        return null;
      }
    },

    async trackUniqueShare(postId: string, userIdentifier: string) {
      try {
        const isAuthenticatedUser = userIdentifier.startsWith('user_');
        
        if (isAuthenticatedUser) {
          // For authenticated users, check for duplicates
          const userId = parseInt(userIdentifier.replace('user_', ''));
          
          // Check if user has already shared this post
          const { data: existingShare, error: checkError } = await supabase
            .from('post_interactions')
            .select('id')
            .eq('post_id', parseInt(postId))
            .eq('user_id', userId)
            .eq('interaction_type', 'share')
            .maybeSingle();

          if (checkError) throw checkError;

          if (existingShare) {
            // Get current stats for response
            const updatedPost = await socialFeedDb.posts.getById(postId);
            const userLiked = await socialFeedDb.reactions.hasUserLiked(postId, userId);
            
            return {
              success: false,
              stats: {
                likes: updatedPost?.reaction_count || 0,
                comments: updatedPost?.comment_count || 0,
                shares: updatedPost?.share_count || 0,
                views: updatedPost?.view_count || 0
              },
              user_interaction: {
                has_liked: userLiked,
                has_shared: true
              }
            };
          }

          // Insert new share interaction record for authenticated user
          const { data, error } = await supabase
            .from('post_interactions')
            .insert({
              post_id: parseInt(postId),
              user_id: userId,
              interaction_type: 'share',
              interaction_value: 1,
              created_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error) throw error;
        }

        // For both authenticated and anonymous users, increment the share count
        // Get current share count and increment by 1
        const { data: currentPost, error: getError } = await supabase
          .from('posts')
          .select('share_count')
          .eq('id', parseInt(postId))
          .single();

        if (getError) throw getError;

        const newShareCount = (currentPost?.share_count || 0) + 1;
        
        // Update the post's share count
        const { error: updateError } = await supabase
          .from('posts')
          .update({ share_count: newShareCount })
          .eq('id', parseInt(postId));

        if (updateError) throw updateError;

        // Get updated post stats
        const updatedPost = await socialFeedDb.posts.getById(postId);
        
        return { 
          success: true,
          stats: {
            likes: updatedPost?.reaction_count || 0,
            comments: updatedPost?.comment_count || 0,
            shares: updatedPost?.share_count || 0,
            views: updatedPost?.view_count || 0
          },
          user_interaction: {
            has_liked: isAuthenticatedUser ? await socialFeedDb.reactions.hasUserLiked(postId, parseInt(userIdentifier.replace('user_', ''))) : false,
            has_shared: true
          }
        };
      } catch (error) {
        console.error('trackUniqueShare error:', error);
        throw error;
      }
    },

    async trackShare(postId: string, userId: number) {
      try {
        // Check if user has already shared this post
        const { data: existingShare, error: checkError } = await supabase
          .from('post_interactions')
          .select('id')
          .eq('post_id', parseInt(postId))
          .eq('user_id', userId)
          .eq('interaction_type', 'share')
          .maybeSingle();

        if (checkError) throw checkError;

        // If user already shared, don't track again (like views)
        if (existingShare) {
          return existingShare;
        }

        // Insert new share interaction record
        const { data, error } = await supabase
          .from('post_interactions')
          .insert({
            post_id: parseInt(postId),
            user_id: userId,
            interaction_type: 'share',
            interaction_value: 1,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        // Update the post's share count
        await this.updatePostShareCount(postId);
        return data;
      } catch (error) {
        throw error;
      }
    },

    async getPostViews(postId: string) {
      const { data, error } = await supabase
        .from('post_interactions')
        .select('user_id, created_at')
        .eq('post_id', parseInt(postId))
        .eq('interaction_type', 'view');

      if (error) throw error;
      return data?.length || 0;
    },

    async getPostShares(postId: string) {
      const { data, error } = await supabase
        .from('post_interactions')
        .select('user_id, created_at')
        .eq('post_id', parseInt(postId))
        .eq('interaction_type', 'share');

      if (error) throw error;
      return data?.length || 0;
    },

    async updatePostViewCount(postId: string) {
      const viewCount = await this.getPostViews(postId);
      
      const { error } = await supabase
        .from('posts')
        .update({ view_count: viewCount })
        .eq('id', parseInt(postId));

      // Silent fail in production
    },

    async updatePostShareCount(postId: string) {
      try {
        // Count unique users who shared this post (one share per user)
        const { data: shareData, error: shareError } = await supabase
          .from('post_interactions')
          .select('user_id', { count: 'exact' })
          .eq('post_id', parseInt(postId))
          .eq('interaction_type', 'share');

        if (shareError) throw shareError;

        const totalShares = shareData?.length || 0;
        
        // Update the post's share count
        const { error: updateError } = await supabase
          .from('posts')
          .update({ share_count: totalShares })
          .eq('id', parseInt(postId));

        if (updateError) {
          throw updateError;
        }

        return totalShares;
      } catch (error) {
        throw error;
      }
    },

    async hasUserShared(postId: string, userId: number) {
      try {
        const { data, error } = await supabase
          .from('post_interactions')
          .select('id')
          .eq('post_id', parseInt(postId))
          .eq('user_id', userId)
          .eq('interaction_type', 'share')
          .maybeSingle();

        if (error) throw error;
        return !!data;
      } catch (error) {
        return false;
      }
    }
  },

  // Helper functions
  getUserRole(userType: string) {
    switch (userType) {
      case 'ngo': return 'NGO Representative'
      case 'company': return 'Corporate Partner'
      case 'individual': return 'Community Professional'
      default: return 'Community Member'
    }
  },

  getDefaultAvatar(userType: string) {
    switch (userType) {
      case 'ngo': return "https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
      case 'company': return "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
      default: return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
    }
  },

  getTimeAgo(dateString: string) {
    const now = new Date()
    const then = new Date(dateString)
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

    if (seconds < 60) return 'now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo`
    return `${Math.floor(seconds / 31536000)}y`
  }
};

