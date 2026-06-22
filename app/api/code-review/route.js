// Rate limiting store
const userReviews = new Map();

/**
 * Helper: Strip comments from code while preserving string content
 * Prevents false positives when syntax characters appear inside comments
 */
function stripComments(code) {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < code.length) {
    const char = code[i];
    const nextChar = code[i + 1];

    // Track strings (single/double quotes)
    if ((char === '"' || char === "'" || char === '`') && code[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      } else if (char === stringChar) {
        inString = false;
        result += char;
        i++;
        continue;
      }
    }

    // Skip comments when not in string
    if (!inString) {
      // Single-line comment
      if (char === '/' && nextChar === '/') {
        while (i < code.length && code[i] !== '\n') i++;
        result += '\n'; // Preserve line count
        continue;
      }
      // Multi-line comment
      if (char === '/' && nextChar === '*') {
        i += 2;
        while (i < code.length - 1) {
          if (code[i] === '*' && code[i + 1] === '/') {
            i += 2;
            break;
          }
          if (code[i] === '\n') result += '\n'; // Preserve line count
          i++;
        }
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Helper: Check if brackets/braces/parentheses are balanced
 * Properly handles strings and escape sequences
 * Returns { balanced: boolean, issues: array }
 */
function checkBracketBalance(code) {
  const issues = [];
  const stack = [];
  const bracketPairs = { '(': ')', '{': '}', '[': ']' };
  const openBrackets = new Set(Object.keys(bracketPairs));
  const closeBrackets = new Set(Object.values(bracketPairs));

  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < code.length) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle escape sequences
    if (prevChar === '\\') {
      i++;
      continue;
    }

    // Track strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    // Skip bracket checking inside strings
    if (inString) {
      i++;
      continue;
    }

    // Check opening brackets
    if (openBrackets.has(char)) {
      stack.push({ char, index: i, line: code.substring(0, i).split('\n').length });
    }

    // Check closing brackets
    if (closeBrackets.has(char)) {
      if (stack.length === 0) {
        issues.push({
          type: 'syntax',
          severity: 'High',
          message: `Unexpected closing '${char}' without matching opening bracket`,
          line: code.substring(0, i).split('\n').length,
        });
      } else {
        const last = stack[stack.length - 1];
        if (bracketPairs[last.char] === char) {
          stack.pop();
        } else {
          issues.push({
            type: 'syntax',
            severity: 'High',
            message: `Mismatched brackets: expected '${bracketPairs[last.char]}' but found '${char}'`,
            line: code.substring(0, i).split('\n').length,
          });
          stack.pop();
        }
      }
    }

    i++;
  }

  // Report unclosed brackets
  while (stack.length > 0) {
    const unclosed = stack.pop();
    issues.push({
      type: 'syntax',
      severity: 'High',
      message: `Unclosed '${unclosed.char}' - missing closing '${bracketPairs[unclosed.char]}'`,
      line: unclosed.line,
    });
  }

  return {
    balanced: issues.length === 0,
    issues,
  };
}

/**
 * Helper: Check for unclosed strings
 * Handles single quotes, double quotes, and template literals
 * Respects escape sequences
 * FIX: Returns object with 'issues' property, not array directly
 */
function checkStringBalance(code) {
  const issues = [];
  const stringPatterns = [
    { char: '"', name: 'double quote' },
    { char: "'", name: 'single quote' },
    { char: '`', name: 'template literal' },
  ];

  for (const { char, name } of stringPatterns) {
    let count = 0;
    let lastUnclosedLine = 0;

    for (let i = 0; i < code.length; i++) {
      if (code[i] === char && (i === 0 || code[i - 1] !== '\\')) {
        count++;
        lastUnclosedLine = code.substring(0, i).split('\n').length;
      }
    }

    // Odd number means unclosed
    if (count % 2 !== 0) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: `Unclosed ${name} detected`,
        line: lastUnclosedLine,
      });
    }
  }

  // FIX: Return object with 'issues' property
  return {
    issues: issues,
  };
}

/**
 * Helper: Detect specific language syntax errors
 * Checks for language-specific incomplete patterns
 */
function checkLanguageSyntax(code, language) {
  const issues = [];

  if (language === 'JavaScript' || language === 'React' || language === 'TypeScript') {
    // Missing function body
    if (/function\s+\w+\s*\([^)]*\)\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Function declaration is incomplete - missing function body { }',
      });
    }

    // Missing class body
    if (/class\s+\w+(\s+extends\s+\w+)?\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Class declaration is incomplete - missing class body { }',
      });
    }

    // Missing if/for/while body
    if (/(if|else if|for|while)\s*\([^)]*\)\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Control structure is incomplete - missing body { }',
      });
    }

    // Arrow function missing body
    if (/=>\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Arrow function is incomplete - missing body',
      });
    }
  }

  if (language === 'Python') {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Missing colon after def/class/if/for/while/try/except
      if (/^(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(trimmed)) {
        if (!trimmed.endsWith(':')) {
          issues.push({
            type: 'syntax',
            severity: 'High',
            message: `Missing ':' after '${trimmed.split(/\s+/)[0]}' on line ${i + 1}`,
            line: i + 1,
          });
        }
      }

      // Incomplete string (Python allows triple quotes, check basic case)
      if (trimmed.startsWith('print(') || trimmed.includes('= "') || trimmed.includes("= '")) {
        const doubleQuotes = (line.match(/"/g) || []).length;
        const singleQuotes = (line.match(/'/g) || []).length;

        // Skip if line has triple quotes (allow them)
        if (!line.includes('"""') && !line.includes("'''")) {
          if (doubleQuotes % 2 !== 0) {
            issues.push({
              type: 'syntax',
              severity: 'High',
              message: `Unclosed double quote on line ${i + 1}`,
              line: i + 1,
            });
          }
          if (singleQuotes % 2 !== 0) {
            issues.push({
              type: 'syntax',
              severity: 'High',
              message: `Unclosed single quote on line ${i + 1}`,
              line: i + 1,
            });
          }
        }
      }
    }
  }

  if (language === 'Java') {
    // Missing class body
    if (/public\s+(class|interface)\s+\w+(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Class/interface declaration is incomplete - missing body { }',
      });
    }

    // Missing method body
    if (/public\s+(static\s+)?(\w+)\s+\w+\s*\([^)]*\)(\s+throws\s+[\w,\s]+)?\s*$/.test(code.trim())) {
      issues.push({
        type: 'syntax',
        severity: 'High',
        message: 'Method declaration is incomplete - missing body { }',
      });
    }

    // Missing semicolon (basic check)
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Check for simple statements that should end with semicolon
      if (trimmed && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(';')) {
        if (/^(int|String|boolean|double|float|long)\s+\w+\s*=/.test(trimmed)) {
          issues.push({
            type: 'syntax',
            severity: 'Medium',
            message: `Missing semicolon at end of statement on line ${i + 1}`,
            line: i + 1,
          });
        }
      }
    }
  }

  return {
    issues: issues,
  };
}

/**
 * Helper: Detect language with improved accuracy
 */
function detectLanguage(code) {
  const lowerCode = code.toLowerCase();

  // React detection (check before JavaScript)
  if (code.includes('import React') || code.includes('useState') || code.includes('useEffect') || /<\w+[^>]*\/?>/.test(code)) {
    return 'React';
  }

  // TypeScript detection
  if (code.includes('interface ') || code.includes('type ') || /:\s*(string|number|boolean|any|unknown|void)\s*[=;,\)]/.test(code)) {
    return 'TypeScript';
  }

  // Python detection
  if (code.includes('def ') || code.includes('import ') && lowerCode.includes('python') || /^(if|for|while|def|class)\s+/.test(code.trim())) {
    return 'Python';
  }

  // Java detection
  if (code.includes('public class') || code.includes('import java.') || /public\s+(static\s+)?.*\(.*\)/.test(code)) {
    return 'Java';
  }

  // Default to JavaScript
  return 'JavaScript';
}

export async function POST(request) {
  try {
    const { code } = await request.json();

    if (!code || code.trim().length === 0) {
      return Response.json({ error: 'No code provided' }, { status: 400 });
    }

    // Rate limiting (10 per hour)
    const now = Date.now();
    const userHistory = userReviews.get('anonymous') || [];
    const recentReviews = userHistory.filter(time => now - time < 3600000);

    if (recentReviews.length >= 10) {
      return Response.json({ error: 'Rate limit: 10 reviews per hour' }, { status: 429 });
    }

    userReviews.set('anonymous', [...recentReviews, now]);

    // Detect language early (before analysis)
    const language = detectLanguage(code);

    // Collect all issues
    const issues = [];

    // ============================================
    // IMPROVED SYNTAX VALIDATION
    // ============================================

    // 1. Check bracket balance
    const bracketCheck = checkBracketBalance(code);
    issues.push(...bracketCheck.issues);

    // 2. Check string balance (FIX: Now returns object with 'issues' property)
    const stringCheck = checkStringBalance(code);
    issues.push(...stringCheck.issues);

    // 3. Check language-specific syntax (FIX: Now returns object with 'issues' property)
    const languageSyntaxCheck = checkLanguageSyntax(code, language);
    issues.push(...languageSyntaxCheck.issues);

    // ============================================
    // EXISTING CHECKS (with improved comment stripping)
    // ============================================

    // Strip comments AFTER syntax checks (to catch unclosed strings in comments)
    const cleanCode = stripComments(code);

    // Security issues
    if (/eval\(/g.test(cleanCode)) {
      issues.push({ type: 'security', severity: 'Critical', message: 'Never use eval() - security risk' });
    }
    if (/innerHTML\s*=/g.test(cleanCode)) {
      issues.push({ type: 'security', severity: 'High', message: 'innerHTML can cause XSS attacks' });
    }

    // Performance issues
    if (/for\s*\([^)]*\)\s*\{[^{}]*for\s*\([^)]*\)/s.test(cleanCode) ||
      /for\s*\([^)]*\)\s*(?!\{)\s*for\s*\([^)]*\)/s.test(cleanCode)) {
      issues.push({ type: 'performance', severity: 'Medium', message: 'Nested loops - O(n²) complexity' });
    }

    // Best practices
    if (/var\s+/g.test(cleanCode)) {
      issues.push({ type: 'best_practice', severity: 'Low', message: 'Use const/let instead of var' });
    }
    if (/console\.log/g.test(cleanCode)) {
      issues.push({ type: 'best_practice', severity: 'Low', message: 'Remove console.log in production' });
    }

    // ============================================
    // QUALITY SCORE CALCULATION (IMPROVED)
    // ============================================
    let score = 10;

    // Deduplicate issues to avoid double-counting same issue
    const uniqueIssues = [];
    const issueSet = new Set();

    for (const issue of issues) {
      const key = `${issue.type}:${issue.severity}:${issue.message}`;
      if (!issueSet.has(key)) {
        issueSet.add(key);
        uniqueIssues.push(issue);
      }
    }

    // Apply severity-based scoring
    for (const issue of uniqueIssues) {
      if (issue.severity === 'Critical') score -= 2;
      else if (issue.severity === 'High') score -= 1.5;
      else if (issue.severity === 'Medium') score -= 1;
      else score -= 0.5;
    }

    // Ensure syntax errors significantly impact score
    const hasSyntaxErrors = uniqueIssues.some(i => i.type === 'syntax');
    if (hasSyntaxErrors && score > 5) {
      score = Math.min(score, 5); // Cap at 5 if syntax errors present
    }

    const qualityScore = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

    // ============================================
    // GENERATE FIXED CODE
    // ============================================
    let fixedCode = code;
    fixedCode = fixedCode.replace(/var\s+/g, 'let ');
    fixedCode = fixedCode.replace(/console\.log\(([\s\S]*?)\)/g, 'void 0 /* console.log removed */');

    // ============================================
    // RESPONSE
    // ============================================
    return Response.json({
      success: true,
      review: {
        quality_score: qualityScore,
        language: language,
        issues: uniqueIssues,
        fixed_code: fixedCode !== code ? fixedCode : null,
        summary: {
          total_issues: uniqueIssues.length,
          syntax_issues: uniqueIssues.filter(i => i.type === 'syntax').length,
          security_issues: uniqueIssues.filter(i => i.type === 'security').length,
          performance_issues: uniqueIssues.filter(i => i.type === 'performance').length,
          best_practice_issues: uniqueIssues.filter(i => i.type === 'best_practice').length,
        }
      }
    });

  } catch (error) {
    console.error('Code review error:', error);
    return Response.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}