import { Hono } from 'hono';
import { ResponseBuilder } from '../core/response';
import { blogDomain } from '../features/blog/blog.domain';

const blogRoutes = new Hono();

// Get all published blog posts
blogRoutes.get('/', async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '12'); // Default 12 for grid
  const search = c.req.query('search');
  const sortBy = c.req.query('sortBy') || 'publishedAt'; // meaningful default for public
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  const result = await blogDomain.getAllBlogPosts({
    page,
    limit,
    search,
    status: 'published', // Force published only
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

// Get single published blog post
blogRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  // TODO: Add slug support if needed, currently using ID
  const post = await blogDomain.getBlogPostById(id);

  if (post.status !== 'published') {
    // Treat non-published as 404 for public API
    // Or we could let it return but frontend handles it. 
    // Secure approach: return 404 or filter in domain.
    // For now, let's just checking status here.
    if (post.status !== 'published') {
      return ResponseBuilder.error(c, 'Blog post not found', 404, 'NOT_FOUND');
    }
  }

  return ResponseBuilder.success(c, post);
});

export default blogRoutes;
