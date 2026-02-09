# Installing GSD from a Fork

This guide explains how to install and use GSD (Get Shit Done) from a forked repository, such as your own custom version or the RooCode runtime fork.

## Why Install from a Fork?

Common reasons to install GSD from a fork:

- **Testing custom changes** - You've modified GSD and want to test your changes
- **RooCode Runtime** - Using the RooCode VSCode Extension runtime variant of GSD
- **Custom workflows** - You've added custom commands or workflows specific to your needs
- **Development** - Contributing to GSD development

## Prerequisites

Before installing from a fork, ensure you have:

- **Node.js** (v18 or later recommended)
- **npm** or **yarn** package manager
- **Git** installed and configured
- Access to the forked repository (your fork or the RooCode runtime fork)

## Installation Methods

### Method 1: Local Development Installation

Use this method if you have the fork cloned locally and want to test changes.

**Steps:**

1. **Navigate to your fork directory:**
   ```bash
   cd /path/to/your/get-shit-done-fork
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project (if applicable):**
   ```bash
   npm run build
   # or
   npm run compile
   ```

4. **Link globally for testing:**
   ```bash
   npm link
   ```

5. **Verify installation:**
   ```bash
   gsd --version
   # or
   get-shit-done --version
   ```

6. **Test in a project:**
   ```bash
   cd /path/to/your/test-project
   gsd --help
   ```

**Unlink when done:**
```bash
npm unlink -g get-shit-done
```

---

### Method 2: Install from GitHub Fork URL

Install directly from your GitHub fork using npm/git.

**Steps:**

1. **Install from your fork:**
   ```bash
   npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
   ```

   Or using git directly:
   ```bash
   git clone https://github.com/YOUR_USERNAME/get-shit-done.git
   cd get-shit-done
   npm install -g .
   ```

2. **Verify installation:**
   ```bash
   gsd --version
   ```

3. **Update to latest from your fork:**
   ```bash
   npm update -g get-shit-done
   # or reinstall
   npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
   ```

---

### Method 3: RooCode Runtime Fork

If you're installing the RooCode runtime variant (optimized for VSCode Extension):

**Repository:** `https://github.com/YOUR_USERNAME/get-shit-done` (your fork of the RooCode runtime)

**Steps:**

1. **Clone your RooCode runtime fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/get-shit-done.git
   cd get-shit-done
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **The `.roo/` structure is already in place** - No additional build step needed for RooCode

4. **Open your project in VSCode with RooCode extension:**
   - The `.roo/commands/` directory contains all GSD commands
   - The `.roo/agents/` directory contains all GSD agent definitions
   - The `.roo/get-shit-done/` directory contains workflow templates

5. **Verify installation in RooCode:**
   - Open RooCode chat in VSCode
   - Type: `/gsd-help`
   - You should see all GSD commands listed

---

### Method 4: Development Mode with Live Reload

For active development, use tools like `nodemon` for automatic reloading.

**Steps:**

1. **Install development dependencies:**
   ```bash
   cd /path/to/your/get-shit-done-fork
   npm install --save-dev nodemon
   ```

2. **Run in development mode:**
   ```bash
   npx nodemon --exec "npm link" --watch .roo/
   ```

3. **In your test project:**
   ```bash
   cd /path/to/test-project
   gsd --help  # Should reflect latest changes
   ```

---

## Verifying Your Installation

After installing from a fork, verify everything works:

### For Claude Code CLI (Terminal):

```bash
# Check version
gsd --version

# View help
gsd --help

# Test basic command
gsd-progress  # Should show project status if in a GSD project
```

### For RooCode VSCode Extension:

1. **Open VSCode** with your project
2. **Open RooCode chat**
3. **Run help command:**
   ```
   /gsd-help
   ```
4. **Verify commands appear** in the command list
5. **Test progress command:**
   ```
   /gsd-progress
   ```

---

## Project-Specific Installation

To use your forked GSD in a specific project:

### Option A: Global Installation (Recommended)

```bash
# Install globally from your fork
npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git

# Use in any project
cd /path/to/your/project
gsd-new-project
```

### Option B: Local Installation

```bash
# Install in project directory
cd /path/to/your/project
npm install https://github.com/YOUR_USERNAME/get-shit-done.git

# Use via npx
npx get-shit-done --help
```

### Option C: RooCode Project Setup

For RooCode, the setup is different:

1. **Copy `.roo/` directory** from your fork to your project:
   ```bash
   cp -r /path/to/get-shit-done-fork/.roo /path/to/your/project/
   ```

2. **OR** clone your fork and work directly in it:
   ```bash
   cd /path/to/your/get-shit-done-fork
   code .  # Opens in VSCode with RooCode
   ```

3. **Commands are automatically available** in RooCode chat

---

## Updating Your Fork Installation

### Keep your fork up-to-date with upstream:

```bash
# Navigate to your fork
cd /path/to/get-shit-done-fork

# Add upstream remote (if not already added)
git remote add upstream https://github.com/anthropics/get-shit-done.git

# Fetch latest changes
git fetch upstream

# Merge upstream changes into your fork
git merge upstream/main

# Push to your fork
git push origin main
```

### Reinstall to get updates:

```bash
npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
```

---

## Troubleshooting

### Issue: "Command not found: gsd"

**Solution:** The global binary might not be in your PATH.

```bash
# Check npm global bin directory
npm bin -g

# Add to PATH (add to your ~/.bashrc or ~/.zshrc)
export PATH="$(npm bin -g):$PATH"
```

### Issue: "RooCode doesn't see GSD commands"

**Solution:** Ensure `.roo/` directory structure is correct.

```bash
# Check structure
ls -la .roo/commands/
ls -la .roo/agents/

# Should see files like:
# .roo/commands/gsd-new-project.md
# .roo/commands/gsd-help.md
# .roo/agents/gsd-planner.md
# etc.
```

### Issue: "Old version of GSD still showing"

**Solution:** Clear npm cache and reinstall.

```bash
# Uninstall old version
npm uninstall -g get-shit-done

# Clear npm cache
npm cache clean --force

# Reinstall from fork
npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
```

### Issue: "Permission denied (public key)"

**Solution:** Configure SSH for GitHub.

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub account
# Copy contents of ~/.ssh/id_ed25519.pub to GitHub SSH settings

# Test connection
ssh -T git@github.com

# Use SSH URL instead of HTTPS
npm install -g git@github.com:YOUR_USERNAME/get-shit-done.git
```

---

## Fork-Specific Configuration

### Custom Command Prefix

If your fork uses a different command prefix (like `gsd:` vs `gsd-`), update command frontmatter:

```yaml
---
description: Your custom description
original_path: .roo/commands/your-command.md
---
```

### Custom Agent Modes

If your fork adds custom agent modes, update `.roomodes`:

```yaml
customModes:
  - slug: your-custom-mode
    name: Your Custom Mode
    description: Your custom mode description
    roleDefinition: |-
      You are a custom agent with specific instructions...
    groups:
      - read
      - edit
      - command
```

---

## Contributing Back

If you've made improvements to GSD:

1. **Ensure changes are tested** in both Claude Code CLI and RooCode
2. **Update documentation** (README.md, CHANGELOG.md, etc.)
3. **Follow contribution guidelines** from the upstream repository
4. **Submit pull request** to upstream if changes are general-purpose

---

## Additional Resources

- **GSD Documentation:** [README.md](./README.md)
- **RooCode Setup:** [.roo/README.md](./.roo/README.md)
- **Command Reference:** [.roo/commands/gsd-help.md](./.roo/commands/gsd-help.md)
- **Project State:** [.planning/STATE.md](./.planning/STATE.md)

---

## Quick Reference

### Install from fork (CLI):
```bash
npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
```

### Install from fork (RooCode):
```bash
git clone https://github.com/YOUR_USERNAME/get-shit-done.git
cd get-shit-done
code .  # Open in VSCode with RooCode
```

### Verify installation:
```bash
# CLI
gsd --version

# RooCode
/gsd-help
```

### Update from fork:
```bash
npm install -g https://github.com/YOUR_USERNAME/get-shit-done.git
```

---

**Last Updated:** 2026-02-09
**Compatible with:** GSD v1.0.0 (RooCode Runtime)
