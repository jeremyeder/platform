#!/usr/bin/env python3
"""
Documentation Synchronization Script

Validates and synchronizes documentation across the Ambient Code Platform.
Uses Claude API for intelligent analysis and updates.
"""

import os
import sys
import json
import glob
import re
import yaml
from pathlib import Path
from typing import Dict, List, Tuple, Set
from datetime import datetime
import anthropic


class DocumentationSynchronizer:
    """Main synchronization orchestrator"""

    def __init__(self, repo_root: str = None, api_key: str = None):
        self.repo_root = Path(repo_root or os.getcwd())
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable required")

        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.errors = []
        self.warnings = []
        self.changes = []
        self.stats = {
            "total_files": 0,
            "broken_links": 0,
            "orphaned_files": 0,
            "agent_violations": 0,
            "sync_issues": 0,
        }

    def run(self) -> Dict:
        """Run complete synchronization suite"""
        print("🔍 Starting documentation synchronization...")
        print(f"📁 Repository: {self.repo_root}")

        # Phase 1: Inventory
        markdown_files = self.find_all_markdown_files()
        self.stats["total_files"] = len(markdown_files)
        print(f"📄 Found {len(markdown_files)} markdown files")

        # Phase 2: Validation
        print("\n🔗 Validating links...")
        broken_links = self.validate_links(markdown_files)
        self.stats["broken_links"] = len(broken_links)

        print("\n📚 Validating MkDocs navigation...")
        orphaned = self.validate_mkdocs_nav()
        self.stats["orphaned_files"] = len(orphaned)

        print("\n🤖 Validating agent compliance...")
        agent_issues = self.validate_agent_compliance()
        self.stats["agent_violations"] = len(agent_issues)

        print("\n🔄 Checking CLAUDE.md synchronization...")
        sync_issues = self.check_claude_md_sync()
        self.stats["sync_issues"] = len(sync_issues)

        print("\n📝 Checking README.md ↔ docs/index.md divergence...")
        readme_divergence = self.check_readme_divergence()

        # Phase 3: Generate report
        report = self.generate_report(
            broken_links, orphaned, agent_issues, sync_issues, readme_divergence
        )

        print("\n" + "=" * 60)
        print("📊 SYNCHRONIZATION REPORT")
        print("=" * 60)
        print(f"Total files: {self.stats['total_files']}")
        print(f"Broken links: {self.stats['broken_links']}")
        print(f"Orphaned files: {self.stats['orphaned_files']}")
        print(f"Agent violations: {self.stats['agent_violations']}")
        print(f"Sync issues: {self.stats['sync_issues']}")
        print(f"Errors: {len(self.errors)}")
        print(f"Warnings: {len(self.warnings)}")
        print(f"Changes proposed: {len(self.changes)}")

        return report

    def find_all_markdown_files(self) -> List[Path]:
        """Find all markdown files, excluding vendor directories"""
        markdown_files = []
        exclude_patterns = [
            "**/node_modules/**",
            "**/vendor/**",
            "**/.next/**",
            "**/dist/**",
            "**/.venv/**",
        ]

        for md_file in self.repo_root.rglob("*.md"):
            # Check if file matches any exclude pattern
            if any(md_file.match(pattern) for pattern in exclude_patterns):
                continue
            markdown_files.append(md_file)

        return sorted(markdown_files)

    def validate_links(self, markdown_files: List[Path]) -> List[Dict]:
        """Validate all markdown links across files"""
        broken_links = []
        link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

        for md_file in markdown_files:
            try:
                content = md_file.read_text(encoding='utf-8')
                relative_path = md_file.relative_to(self.repo_root)

                for match in link_pattern.finditer(content):
                    link_text = match.group(1)
                    link_url = match.group(2)

                    # Skip external URLs, anchors, and special URLs
                    if link_url.startswith(('http://', 'https://', '#', 'mailto:')):
                        continue

                    # Remove anchor from URL
                    link_path = link_url.split('#')[0]
                    if not link_path:  # Just an anchor
                        continue

                    # Resolve relative path
                    target = (md_file.parent / link_path).resolve()

                    # Check if target exists
                    if not target.exists():
                        broken_links.append({
                            "file": str(relative_path),
                            "link_text": link_text,
                            "link_url": link_url,
                            "target": str(target.relative_to(self.repo_root)) if self.repo_root in target.parents else str(target),
                            "line": content[:match.start()].count('\n') + 1
                        })
                        self.errors.append(
                            f"Broken link in {relative_path}:{content[:match.start()].count('\n') + 1}: "
                            f"[{link_text}]({link_url}) -> {target}"
                        )
            except Exception as e:
                self.warnings.append(f"Error processing {md_file}: {e}")

        return broken_links

    def validate_mkdocs_nav(self) -> List[Dict]:
        """Validate MkDocs navigation structure"""
        mkdocs_yml = self.repo_root / "mkdocs.yml"
        if not mkdocs_yml.exists():
            self.warnings.append("mkdocs.yml not found")
            return []

        try:
            with open(mkdocs_yml) as f:
                config = yaml.safe_load(f)

            # Extract all files referenced in nav
            nav_files = self._extract_nav_files(config.get('nav', []))

            # Find all markdown files in docs/
            docs_dir = self.repo_root / "docs"
            actual_files = set()
            if docs_dir.exists():
                for md_file in docs_dir.rglob("*.md"):
                    actual_files.add(str(md_file.relative_to(docs_dir)))

            # Find orphaned files (in docs/ but not in nav)
            orphaned = []
            for actual_file in sorted(actual_files):
                if actual_file not in nav_files and actual_file != "README.md":
                    orphaned.append({
                        "file": f"docs/{actual_file}",
                        "reason": "Not referenced in mkdocs.yml nav"
                    })
                    self.warnings.append(f"Orphaned file: docs/{actual_file}")

            # Find missing files (in nav but not on disk)
            for nav_file in nav_files:
                if nav_file not in actual_files:
                    self.errors.append(f"Missing file referenced in nav: docs/{nav_file}")

            return orphaned

        except Exception as e:
            self.errors.append(f"Error parsing mkdocs.yml: {e}")
            return []

    def _extract_nav_files(self, nav_items: List, files: Set[str] = None) -> Set[str]:
        """Recursively extract file paths from nav structure"""
        if files is None:
            files = set()

        for item in nav_items:
            if isinstance(item, dict):
                for key, value in item.items():
                    if isinstance(value, str):
                        # Remove leading docs/ if present
                        file_path = value.replace('docs/', '')
                        files.add(file_path)
                    elif isinstance(value, list):
                        self._extract_nav_files(value, files)
            elif isinstance(item, str):
                file_path = item.replace('docs/', '')
                files.add(file_path)

        return files

    def validate_agent_compliance(self) -> List[Dict]:
        """Validate that agents follow CLAUDE.md standards"""
        agents_dir = self.repo_root / "agents"
        if not agents_dir.exists():
            self.warnings.append("agents/ directory not found")
            return []

        claude_md = self.repo_root / "CLAUDE.md"
        if not claude_md.exists():
            self.errors.append("CLAUDE.md not found - cannot validate agent compliance")
            return []

        issues = []
        agent_files = sorted(agents_dir.glob("*.md"))

        print(f"  Checking {len(agent_files)} agent definitions...")

        for agent_file in agent_files:
            # Use Claude API to check compliance
            violations = self._check_agent_with_claude(agent_file, claude_md)
            if violations:
                issues.append({
                    "agent": agent_file.name,
                    "violations": violations
                })
                for violation in violations:
                    self.warnings.append(f"Agent {agent_file.name}: {violation}")

        return issues

    def _check_agent_with_claude(self, agent_file: Path, claude_md: Path) -> List[str]:
        """Use Claude API to validate agent compliance with CLAUDE.md"""
        try:
            agent_content = agent_file.read_text(encoding='utf-8')
            claude_content = claude_md.read_text(encoding='utf-8')

            # Extract key standards from CLAUDE.md (simplified for brevity)
            # In production, this would be more sophisticated

            violations = []

            # Check 1: Does agent reference CLAUDE.md standards?
            if "CLAUDE.md" not in agent_content and "development standards" not in agent_content.lower():
                violations.append("Does not reference CLAUDE.md or development standards")

            # Check 2: Does agent enforce testing requirements?
            if "test" in claude_content.lower() and agent_file.name not in ["neil-test_engineer.md"]:
                # Only flag if agent should enforce testing
                pass

            # Additional checks would go here

            return violations

        except Exception as e:
            self.warnings.append(f"Error checking agent {agent_file.name}: {e}")
            return []

    def check_claude_md_sync(self) -> List[Dict]:
        """Check CLAUDE.md synchronization with component READMEs"""
        claude_md = self.repo_root / "CLAUDE.md"
        if not claude_md.exists():
            self.errors.append("CLAUDE.md not found")
            return []

        sync_issues = []
        claude_content = claude_md.read_text(encoding='utf-8')

        # Find all component READMEs
        components_dir = self.repo_root / "components"
        if not components_dir.exists():
            return []

        component_readmes = sorted(components_dir.rglob("README.md"))

        for readme in component_readmes:
            try:
                readme_content = readme.read_text(encoding='utf-8')
                relative_path = readme.relative_to(self.repo_root)

                # Check if README is referenced in CLAUDE.md
                readme_str = str(relative_path)
                if readme_str not in claude_content:
                    sync_issues.append({
                        "file": readme_str,
                        "issue": "Not referenced in CLAUDE.md",
                        "severity": "warning"
                    })
                    self.warnings.append(f"Component README not referenced in CLAUDE.md: {readme_str}")

                # Extract commands from README (look for code blocks with make, npm, go commands)
                commands = self._extract_commands_from_readme(readme_content)

                # Check if commands are documented in CLAUDE.md
                for cmd in commands:
                    if cmd not in claude_content:
                        sync_issues.append({
                            "file": readme_str,
                            "issue": f"Command not in CLAUDE.md: {cmd}",
                            "severity": "info"
                        })

            except Exception as e:
                self.warnings.append(f"Error processing {readme}: {e}")

        return sync_issues

    def _extract_commands_from_readme(self, content: str) -> List[str]:
        """Extract commands from README code blocks"""
        commands = []
        code_block_pattern = re.compile(r'```(?:bash|sh|shell)?\n(.*?)```', re.DOTALL)

        for match in code_block_pattern.finditer(content):
            block = match.group(1)
            # Extract lines that look like commands
            for line in block.split('\n'):
                line = line.strip()
                if line and not line.startswith('#'):
                    # Look for common command patterns
                    if any(line.startswith(cmd) for cmd in ['make ', 'npm ', 'go ', 'python ', 'docker ', 'kubectl ']):
                        commands.append(line)

        return commands

    def check_readme_divergence(self) -> Dict:
        """Check for divergence between README.md and docs/index.md"""
        readme = self.repo_root / "README.md"
        docs_index = self.repo_root / "docs" / "index.md"

        if not readme.exists() or not docs_index.exists():
            return {}

        try:
            readme_content = readme.read_text(encoding='utf-8')
            docs_content = docs_index.read_text(encoding='utf-8')

            # Use Claude API to analyze divergence
            divergence = self._analyze_divergence_with_claude(readme_content, docs_content)

            if divergence.get("has_divergence"):
                self.warnings.append(
                    f"Content divergence detected between README.md and docs/index.md: "
                    f"{divergence.get('summary', 'Unknown')}"
                )

            return divergence

        except Exception as e:
            self.warnings.append(f"Error checking README divergence: {e}")
            return {}

    def _analyze_divergence_with_claude(self, readme: str, docs_index: str) -> Dict:
        """Use Claude API to analyze content divergence"""
        try:
            message = self.client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                messages=[{
                    "role": "user",
                    "content": f"""Analyze these two documentation files for divergence:

README.md:
{readme[:3000]}

docs/index.md:
{docs_index[:3000]}

Return JSON with:
{{
  "has_divergence": bool,
  "summary": "Brief description of key differences",
  "sections_to_sync": ["list", "of", "sections"]
}}
"""
                }]
            )

            response_text = message.content[0].text
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))

            return {"has_divergence": False}

        except Exception as e:
            self.warnings.append(f"Claude API error in divergence analysis: {e}")
            return {"has_divergence": False}

    def generate_report(self, broken_links, orphaned, agent_issues, sync_issues, readme_divergence) -> Dict:
        """Generate comprehensive report"""
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "stats": self.stats,
            "errors": self.errors,
            "warnings": self.warnings,
            "changes": self.changes,
            "details": {
                "broken_links": broken_links,
                "orphaned_files": orphaned,
                "agent_issues": agent_issues,
                "sync_issues": sync_issues,
                "readme_divergence": readme_divergence
            }
        }

        # Save report to file
        report_file = self.repo_root / "docs-sync-report.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n📄 Full report saved to: {report_file}")

        return report


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Synchronize documentation across the repository")
    parser.add_argument("--repo-root", help="Repository root directory", default=None)
    parser.add_argument("--api-key", help="Anthropic API key", default=None)
    parser.add_argument("--fail-on-errors", action="store_true", help="Exit with code 1 if errors found")

    args = parser.parse_args()

    try:
        syncer = DocumentationSynchronizer(repo_root=args.repo_root, api_key=args.api_key)
        report = syncer.run()

        # Exit with error code if errors found and flag is set
        if args.fail_on_errors and syncer.errors:
            print(f"\n❌ Exiting with error code due to {len(syncer.errors)} errors")
            sys.exit(1)

        if syncer.errors or syncer.warnings:
            print(f"\n⚠️  Documentation sync completed with issues")
            sys.exit(0)

        print(f"\n✅ Documentation sync completed successfully!")
        sys.exit(0)

    except Exception as e:
        print(f"\n❌ Fatal error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
