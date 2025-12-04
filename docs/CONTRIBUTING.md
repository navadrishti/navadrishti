# Contributing to Navdrishti

Welcome to the Navdrishti project! We're excited that you're interested in contributing to our social impact platform. This guide will help you get started with contributing code, documentation, and ideas.

## 🌟 Ways to Contribute

### Code Contributions
- **Bug fixes**: Help us identify and fix issues
- **Feature development**: Implement new features and enhancements
- **Performance improvements**: Optimize existing code
- **Testing**: Write and improve test coverage
- **Documentation**: Improve code comments and documentation

### Non-Code Contributions
- **UI/UX Design**: Design improvements and user experience enhancements
- **Content**: Help with copy, translations, and content creation
- **Testing**: Manual testing and bug reporting
- **Community**: Help other contributors and users
- **Ideas**: Share feature ideas and improvement suggestions

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18.0.0 or higher
- **npm** or **yarn** package manager
- **Git** for version control
- **Code Editor** (VS Code recommended)
- **Supabase Account** for database access

### Development Setup
1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/Navdrishti.git
   cd Navdrishti
   ```

2. **Set Up Environment**
   ```bash
   # Install dependencies
   npm install
   
   # Copy environment template
   cp .env.example .env.local
   
   # Configure your environment variables
   # (See ENVIRONMENT.md for detailed setup)
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   # Visit http://localhost:3000
   ```

4. **Verify Setup**
   ```bash
   # Run linting
   npm run lint
   
   # Check types
   npm run type-check
   
   # Run tests (when available)
   npm run test
   ```

## 📋 Development Workflow

### Branch Naming Convention
```bash
# Feature branches
git checkout -b feature/add-notification-system
git checkout -b feature/improve-search-functionality

# Bug fix branches  
git checkout -b fix/login-redirect-issue
git checkout -b fix/image-upload-error

# Documentation branches
git checkout -b docs/api-reference-update
git checkout -b docs/deployment-guide

# Hotfix branches (for urgent production fixes)
git checkout -b hotfix/security-patch
```

### Commit Message Format
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
type(scope): short description

feat(auth): add JWT token refresh mechanism
fix(ui): resolve mobile navigation overlay issue
docs(api): update service offers endpoint documentation
style(components): format code according to prettier rules
refactor(db): optimize user query performance
test(auth): add unit tests for login functionality
chore(deps): update dependencies to latest versions
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates, etc.

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Follow coding standards (see below)
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all existing tests pass

3. **Test Your Changes**
   ```bash
   # Lint your code
   npm run lint
   
   # Check TypeScript types
   npm run type-check
   
   # Run tests
   npm run test
   
   # Build project to ensure no build errors
   npm run build
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat(component): add new feature description"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

6. **PR Template**
   ```markdown
   ## Description
   Brief description of what this PR does.
   
   ## Type of Change
   - [ ] Bug fix (non-breaking change which fixes an issue)
   - [ ] New feature (non-breaking change which adds functionality)
   - [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
   - [ ] Documentation update
   
   ## How Has This Been Tested?
   Describe the tests you ran to verify your changes.
   
   ## Screenshots (if applicable)
   Add screenshots to help explain your changes.
   
   ## Checklist
   - [ ] My code follows the style guidelines of this project
   - [ ] I have performed a self-review of my own code
   - [ ] I have commented my code, particularly in hard-to-understand areas
   - [ ] I have made corresponding changes to the documentation
   - [ ] My changes generate no new warnings
   - [ ] I have added tests that prove my fix is effective or that my feature works
   ```

## 🎨 Coding Standards

### TypeScript Guidelines
```typescript
// Use explicit types when they're not obvious
interface UserProfile {
  id: number;
  name: string;
  email: string;
  userType: 'individual' | 'ngo' | 'company';
  createdAt: Date;
}

// Use proper async/await error handling
async function fetchUserData(userId: number): Promise<UserProfile | null> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

// Use proper component typing
interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  disabled = false, 
  variant = 'primary' 
}) => {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
};
```

### React Component Guidelines
```tsx
// Use functional components with hooks
import { useState, useEffect } from 'react';

// Component should have clear props interface
interface PostCardProps {
  post: Post;
  onLike: (postId: number) => void;
  onComment: (postId: number) => void;
}

export function PostCard({ post, onLike, onComment }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.userInteraction?.hasLiked || false);
  
  // Use descriptive function names
  const handleLikeClick = () => {
    setIsLiked(!isLiked);
    onLike(post.id);
  };
  
  return (
    <div className="post-card">
      {/* Component JSX */}
    </div>
  );
}
```

### API Route Guidelines
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Validate authentication when required
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // Implement business logic
    const posts = await fetchPosts(user.id);
    
    return NextResponse.json({ 
      success: true, 
      data: posts 
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
```

### CSS/Styling Guidelines
```css
/* Use Tailwind CSS utility classes primarily */
.post-card {
  @apply bg-white rounded-lg shadow-md p-6 mb-4 hover:shadow-lg transition-shadow;
}

/* For complex components, use CSS modules */
.complexComponent {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 1rem;
}

.complexComponent__header {
  grid-column: 1 / -1;
  border-bottom: 1px solid theme('colors.gray.200');
}

/* Use semantic class names */
.service-offer-card--featured {
  @apply border-2 border-blue-500;
}
```

## 🧪 Testing Guidelines

### Unit Tests (Future Implementation)
```typescript
// __tests__/components/Button.test.tsx
import { render, fireEvent, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button Component', () => {
  it('renders children correctly', () => {
    render(<Button onClick={() => {}}>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  
  it('calls onClick handler when clicked', () => {
    const mockClick = jest.fn();
    render(<Button onClick={mockClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(mockClick).toHaveBeenCalledTimes(1);
  });
});
```

### API Tests
```typescript
// __tests__/api/posts.test.ts
import { createMocks } from 'node-mocks-http';
import handler from '@/app/api/posts/route';

describe('/api/posts', () => {
  it('should return posts for authenticated user', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token'
      }
    });
    
    await handler(req, res);
    
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
```

## 📖 Documentation Standards

### Code Comments
```typescript
/**
 * Authenticates user and returns JWT token
 * @param email - User's email address
 * @param password - User's password (plain text)
 * @returns Promise resolving to authentication result
 * @throws AuthError when credentials are invalid
 */
async function authenticateUser(
  email: string, 
  password: string
): Promise<AuthResult> {
  // Validate input parameters
  if (!email || !password) {
    throw new AuthError('Email and password are required');
  }
  
  // Hash password and compare with stored hash
  const user = await findUserByEmail(email);
  const isValid = await bcrypt.compare(password, user.passwordHash);
  
  if (!isValid) {
    throw new AuthError('Invalid credentials');
  }
  
  // Generate and return JWT token
  return generateToken(user);
}
```

### README Updates
When adding new features, update relevant documentation:
- API endpoints in `docs/API_REFERENCE.md`
- Environment variables in `docs/ENVIRONMENT.md`
- Database changes in `docs/DATABASE_SCHEMA.md`

## 🔍 Code Review Process

### Review Checklist
**Functionality**
- [ ] Code works as intended
- [ ] Edge cases are handled
- [ ] Error handling is appropriate
- [ ] Performance considerations are addressed

**Code Quality**
- [ ] Code is readable and well-commented
- [ ] Follows established patterns and conventions
- [ ] No duplicate code or unnecessary complexity
- [ ] TypeScript types are properly defined

**Security**
- [ ] Input validation is implemented
- [ ] Authentication/authorization is proper
- [ ] No sensitive data in logs or responses
- [ ] SQL injection and XSS protection

**Testing & Documentation**
- [ ] Tests are included for new functionality
- [ ] Documentation is updated
- [ ] Breaking changes are clearly marked

### Review Guidelines for Reviewers
1. **Be constructive and respectful**
2. **Explain your suggestions clearly**
3. **Focus on the code, not the person**
4. **Suggest alternatives when requesting changes**
5. **Approve when ready, don't be overly perfectionist**

### Review Guidelines for Authors
1. **Respond to all comments**
2. **Ask for clarification if needed**
3. **Make requested changes or explain why not**
4. **Test your changes after addressing feedback**
5. **Thank reviewers for their time**

## 🐛 Bug Report Guidelines

### Bug Report Template
```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment**
- OS: [e.g. Windows, macOS, Linux]
- Browser: [e.g. chrome, safari]
- Version: [e.g. 22]
- Node.js version: [e.g. 18.0.0]

**Additional Context**
Add any other context about the problem here.
```

## 💡 Feature Request Guidelines

### Feature Request Template
```markdown
**Feature Description**
A clear and concise description of what you want to happen.

**Problem Statement**
What problem would this feature solve? Who would benefit?

**Proposed Solution**
Describe the solution you'd like in detail.

**Alternative Solutions**
Describe any alternative solutions or features you've considered.

**Additional Context**
Add any other context, mockups, or examples about the feature request.

**Implementation Considerations**
- Technical complexity: [Low/Medium/High]
- Priority: [Low/Medium/High/Critical]
- Timeline: [When do you need this?]
```

## 🏆 Recognition

### Contributors
We recognize contributors in several ways:
- **GitHub Contributors Graph**: Automatic recognition for code contributions
- **Release Notes**: Major contributors mentioned in release notes
- **Hall of Fame**: Outstanding contributors featured on our website
- **Swag**: Stickers and t-shirts for significant contributors

### How to Get Involved
1. **Start Small**: Look for issues labeled `good first issue`
2. **Join Discussions**: Participate in issue discussions and planning
3. **Help Others**: Answer questions and help new contributors
4. **Share Ideas**: Propose new features and improvements
5. **Spread the Word**: Help promote the project in your community

## 📞 Getting Help

### Communication Channels
- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: contact@navdrishti.com for private matters
- **Documentation**: Check our comprehensive docs in the `/docs` folder

### FAQ for Contributors

**Q: How do I set up the development environment?**
A: Follow the setup guide in this document and refer to `docs/ENVIRONMENT.md` for detailed configuration.

**Q: What should I work on first?**
A: Look for issues labeled `good first issue`, `help wanted`, or `documentation` to start with.

**Q: How long does code review take?**
A: We aim to provide initial feedback within 48 hours. Complex PRs may take longer.

**Q: Can I work on multiple features simultaneously?**
A: It's better to focus on one PR at a time for easier review and merging.

**Q: What if I disagree with review feedback?**
A: Feel free to discuss! Explain your reasoning and we can work together to find the best solution.

## 🎯 Project Goals

### Mission
Navdrishti aims to create meaningful connections between those who need help and those who can provide it, fostering a sustainable ecosystem for social impact and community development.

### Technical Goals
- **Scalability**: Support growing user base with robust architecture
- **Performance**: Fast, responsive user experience across all devices  
- **Security**: Protect user data and ensure platform integrity
- **Accessibility**: Inclusive design for users with diverse abilities
- **Maintainability**: Clean, well-documented code that's easy to extend

### Community Goals
- **Inclusivity**: Welcome contributors from all backgrounds and skill levels
- **Transparency**: Open development process with clear communication
- **Quality**: High standards for code, documentation, and user experience
- **Impact**: Measurable positive impact on communities using the platform

Thank you for contributing to Navdrishti! Together, we're building something that makes a real difference in people's lives. 🌟