import fs from 'node:fs';
import path from 'node:path';

// Public build-only patch. Changes the private app only on the APK runner.
// No post records, media URLs, identities or private source are published.
const MARKER = 'tdAdminPlayableVideo2026';
const DECLARATIONS = [
  { re: /\bfunction\s+adminPostCard\s*\(/g, replace: 'function tdAdminOriginalPostCard(' },
  { re: /\b(?:const|let)\s+adminPostCard\s*=\s*(?:async\s*)?function\s*\(/g,
    replace: match => match.replace('adminPostCard', 'tdAdminOriginalPostCard') },
  { re: /\b(?:const|let)\s+adminPostCard\s*=\s*(?:async\s*)?\(/g,
    replace: match => match.replace('adminPostCard', 'tdAdminOriginalPostCard') }
];

const DECORATOR = String.raw