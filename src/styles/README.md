# CSS Organization

This directory contains the stylesheets for the Readio React application.

## File Structure

### `original.css`
**Purpose**: Base styles from the original vanilla implementation.

**Contents**:
- CSS variables and design tokens
- Layout and typography foundations
- Original component styles

**DO NOT MODIFY** unless coordinating changes with the vanilla version.

---

### `overrides.css`
**Purpose**: React-specific fixes and icon definitions.

**Contents**:
- Action hover behavior fixes
- Icon mask definitions and sizing
- Developer cache control styles

**When to use**: 
- Fixing React-specific rendering issues
- Adding new icon definitions
- Dev-only utility styles

---

### `gallery.css`
**Purpose**: Gallery modal and related component styles.

**Contents**:
- Podcast view (header, episodes, favorites)
- Recommended view (groups, grids, sentinels)
- Subscription and favorite buttons

**When to use**:
- Adding new Gallery-related components
- Styling podcast/episode displays
- Recommendation UI extensions

---

### `localfiles.css`
**Purpose**: Local files modal component styles.

**Contents**:
- Modal backdrop and container
- File list and item displays
- Upload controls and progress bars

**When to use**:
- Adding new LocalFiles features
- Styling file management UI
- Audio file display components

---

## Guidelines

### Adding New Styles

1. **Choose the right file**:
   - Icons/overrides → `overrides.css`
   - Gallery features → `gallery.css`
   - LocalFiles features → `localfiles.css`
   - Base styles → `original.css` (coordinate with vanilla)

2. **Follow existing patterns**:
   - Use CSS variables for colors/spacing
   - Group related styles with comments
   - Maintain alphabetical property order

3. **Naming conventions**:
   - Gallery: `gallery-*`
   - LocalFiles: `localfiles-*`
   - Recommended: `recommended-*`
   - Icons: `icon-*`

### Import Order

In `App.tsx`:
```tsx
import './styles/original.css';    // Base styles first
import './styles/overrides.css';   // React fixes second
import './styles/gallery.css';     // Component styles
import './styles/localfiles.css';  // More component styles
```

This order ensures proper cascade and specificity.

---

## Maintenance

### Don't Do This ❌
- Mix component styles into `overrides.css`
- Add layout CSS to icon definitions
- Duplicate styles across files

### Do This ✅
- Keep focused, single-purpose files
- Use clear section comments
- Reference this README when unsure

---

## Migration Notes

Previously, all React-specific styles were in a single `icons.css` file (787 lines). This was split into three focused files for better maintainability and reduced CSS bundle size by 10%.
