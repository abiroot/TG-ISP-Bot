# Husky Pre-Commit Hooks Setup

**Date:** 2025-01-29
**Status:** ✅ Complete

---

## Overview

Husky pre-commit hooks have been configured to enforce code quality by automatically running lint and typecheck before every commit. This prevents broken code from being committed to the repository.

---

## What Was Done

### 1. Fixed TypeScript Type Errors ✓

Fixed type errors in `src/utils/toolAuditWrapper.ts`:
- Removed invalid `CoreTool` import (doesn't exist in AI SDK)
- Used generic `any` types for tool wrapping (AI SDK tools are complex generic types)
- Fixed `Personality` interface property access (uses `bot_name` not `name`)
- Changed approach from wrapping with `tool()` to spreading existing tool properties

**Result:** ✅ TypeScript compiles with zero errors

### 2. Verified Lint Passes ✓

Ran ESLint to ensure code quality:
```bash
npm run lint
```

**Result:** ✅ No linting errors

### 3. Installed Husky & Configured Pre-Commit Hook ✓

Installed packages:
```bash
npm install --save-dev husky lint-staged
npx husky init
```

Created `.husky/pre-commit` hook that runs:
1. **Lint check** - Ensures code follows style guidelines
2. **TypeScript check** - Ensures type safety

**Result:** ✅ Pre-commit hook active and working

---

## How It Works

### Pre-Commit Flow

```
Developer runs: git commit -m "message"
                    ↓
         Husky intercepts commit
                    ↓
      🔍 Running pre-commit checks...
                    ↓
         📝 Running lint...
         npm run lint
                    ↓
    ✅ Lint passed → Continue
    ❌ Lint failed → Abort commit
                    ↓
         🔎 Running typecheck...
         npx tsc --noEmit
                    ↓
    ✅ Typecheck passed → Continue
    ❌ Typecheck failed → Abort commit
                    ↓
  ✅ All checks passed → Commit succeeds
```

---

## Files Modified

### New Files
1. `.husky/pre-commit` - Pre-commit hook script

### Modified Files
1. `src/utils/toolAuditWrapper.ts` - Fixed TypeScript errors
2. `package.json` - Added Husky and lint-staged dependencies

### Package.json Scripts
The `prepare` script was already configured (added by `husky init`):
```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

This ensures Husky hooks are installed when running `npm install`.

---

## Usage

### Normal Development

No changes to your workflow! Just commit as usual:

```bash
git add .
git commit -m "feat: add new feature"
```

Husky will automatically run lint and typecheck. If either fails, the commit will be aborted with error details.

### Bypass Hooks (Emergency Only)

If you need to bypass hooks in an emergency:

```bash
git commit -m "fix: urgent fix" --no-verify
```

**⚠️ Warning:** Only use `--no-verify` in emergencies. It bypasses all quality checks!

---

## What Gets Checked

### 1. Lint (ESLint)

Checks for:
- Code style violations
- Unused variables
- Missing semicolons (if configured)
- Import/export issues
- Potential bugs

**Configuration:** `.eslintrc.json` or `eslint.config.js`

### 2. TypeScript Type Check

Checks for:
- Type errors
- Missing type annotations (if strict mode)
- Invalid property access
- Type mismatches
- Generic type issues

**Configuration:** `tsconfig.json`

---

## Troubleshooting

### Hook Not Running

If the hook doesn't run on commit:

1. **Check hook is executable:**
   ```bash
   chmod +x .husky/pre-commit
   ```

2. **Reinstall Husky:**
   ```bash
   npm run prepare
   ```

3. **Verify Git hooks are enabled:**
   ```bash
   git config core.hooksPath
   # Should output: .husky
   ```

### Commit Rejected

If your commit is rejected:

1. **Read the error output** - It will show which check failed
2. **Fix the errors** shown in the output
3. **Try committing again**

Example:
```bash
❌ Type check failed. Please fix the errors and try again.

src/utils/myFile.ts:42:10 - error TS2339: Property 'name' does not exist
```

Fix line 42 in `src/utils/myFile.ts`, then commit again.

### Slow Commits

If pre-commit checks are slow:

1. **Use partial commits** (only commit changed files):
   ```bash
   git add src/specific/file.ts
   git commit -m "fix: specific fix"
   ```

2. **Optimize TypeScript** - Add `skipLibCheck: true` to `tsconfig.json` (already configured)

3. **Consider lint-staged** (only lint changed files):
   ```json
   {
     "lint-staged": {
       "*.ts": ["eslint --fix", "tsc-files --noEmit"]
     }
   }
   ```

---

## Benefits

### ✅ Prevents Broken Code

- No more "oops, forgot to run lint" commits
- TypeScript errors caught before push
- Consistent code quality across team

### ✅ Faster Code Reviews

- Reviewers don't need to point out style issues
- Focus on logic and architecture
- Automated checks handle trivial issues

### ✅ Better Git History

- Every commit passes quality checks
- Easier to bisect bugs
- Clean commit history

### ✅ Catches Issues Early

- Type errors found before CI/CD
- Faster feedback loop
- Less context switching

---

## Advanced Configuration

### Adding More Checks

Edit `.husky/pre-commit` to add more checks:

```bash
echo "🔍 Running pre-commit checks..."

# Run tests on changed files
echo "🧪 Running tests..."
npm run test

# Run security audit
echo "🔒 Running security audit..."
npm audit --audit-level=moderate

# Run build
echo "🏗️  Running build..."
npm run build

echo "✅ All checks passed!"
```

### Using lint-staged (Recommended)

For faster commits, only check changed files:

1. **Install lint-staged:**
   ```bash
   npm install --save-dev lint-staged
   ```

2. **Add to package.json:**
   ```json
   {
     "lint-staged": {
       "*.ts": [
         "eslint --fix",
         "tsc-files --noEmit"
       ]
     }
   }
   ```

3. **Update `.husky/pre-commit`:**
   ```bash
   npx lint-staged
   ```

### Per-File Linting

Edit `.husky/pre-commit` to only lint staged files:

```bash
# Get list of staged TypeScript files
STAGED_TS_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$')

if [ -n "$STAGED_TS_FILES" ]; then
  echo "📝 Running lint on changed files..."
  npx eslint $STAGED_TS_FILES

  echo "🔎 Running typecheck on changed files..."
  npx tsc-files --noEmit $STAGED_TS_FILES
fi
```

---

## Testing the Hook

### Manual Test

Run the hook manually:

```bash
.husky/pre-commit
```

Expected output:
```
🔍 Running pre-commit checks...
📝 Running lint...
✅ Lint passed
🔎 Running typecheck...
✅ Typecheck passed
✅ All pre-commit checks passed!
```

### Test with Intentional Error

1. **Add a type error:**
   ```typescript
   const x: string = 123 // Type error!
   ```

2. **Try to commit:**
   ```bash
   git add .
   git commit -m "test"
   ```

3. **Verify commit is blocked:**
   ```
   ❌ Type check failed. Please fix the errors and try again.
   ```

4. **Fix the error and try again**

---

## Comparison: Before vs After

### Before Husky

```bash
$ git commit -m "feat: add feature"
[main abc123] feat: add feature
 5 files changed, 200 insertions(+)

# Later in CI/CD...
❌ Build failed: TypeScript error on line 42
```

**Problem:** Broken code committed and pushed

### After Husky

```bash
$ git commit -m "feat: add feature"
🔍 Running pre-commit checks...
📝 Running lint...
🔎 Running typecheck...
❌ Type check failed. Please fix the errors and try again.

src/utils/file.ts:42:10 - error TS2339
```

**Solution:** Error caught immediately, before commit

---

## Maintenance

### Updating Husky

```bash
npm update husky
```

### Disabling Hooks Temporarily

```bash
# Disable for one commit
git commit --no-verify

# Disable globally (not recommended)
git config core.hooksPath /dev/null

# Re-enable globally
git config core.hooksPath .husky
```

### Removing Husky

```bash
# Remove packages
npm uninstall husky lint-staged

# Remove prepare script from package.json
# Remove .husky directory
rm -rf .husky
```

---

## Team Guidelines

### For New Team Members

When cloning the repository:

```bash
git clone <repository>
cd <project>
npm install  # Automatically sets up Husky via prepare script
```

Husky hooks are automatically installed!

### For Code Reviews

Reviewers can assume:
- ✅ Code passes lint
- ✅ Code passes typecheck
- ✅ No obvious TypeScript errors

Focus reviews on:
- Logic and architecture
- Edge cases and bugs
- Performance and security
- Code maintainability

---

## Summary

✅ **Lint** - Automatic code style enforcement
✅ **TypeCheck** - Catch type errors before commit
✅ **Pre-commit hook** - Runs on every `git commit`
✅ **Zero config needed** - Works automatically after `npm install`
✅ **Team-wide** - Consistent quality for all developers

**Result:** Higher code quality, fewer bugs, faster development!

---

**Setup By:** Claude Code
**Date:** 2025-01-29
**Status:** ✅ Production Ready
