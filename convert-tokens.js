/**
 * Design Tokens to CSS Variables Converter
 * ---------------------------------------
 * Converts Design Token JSON (Figma Design Tokens format) into structured CSS custom properties (CSS variables).
 * 
 * ARCHITECTURAL NOTICE ON THE COLOR SYSTEM:
 * - Primitive Colors (--primitive-*): Foundational color palettes and key colors. They serve as raw 
 *   palette reference values and MUST NOT be applied directly to UI components.
 * - Color Roles (--color-role-*): Semantic colors mapped to UI element intent (e.g. primary, surface, 
 *   container, error, outline). These reference Primitive Colors via `var(--primitive-...)` and ARE 
 *   the design tokens to be applied directly on UI elements.
 * 
 * Usage:
 *   node convert-tokens.js [options]
 * 
 * Options:
 *   -i, --input <path>       Path to design tokens JSON file (default: ./design-tokens.tokens.json)
 *   -o, --output <path>      Path to output CSS file (default: ./design-tokens.css)
 *   -s, --selector <string>  CSS selector scope for variables (default: :root)
 *   --resolve-aliases        Resolve token aliases directly to raw values instead of var(...) references
 *   --no-format-hex          Preserve 8-digit hex values without trimming 'FF' alpha
 *   -t, --test               Run self-test validation suite
 *   -h, --help               Display help documentation
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Converts camelCase strings to kebab-case.
 * @param {string} str - Input string
 * @returns {string} Kebab-cased string
 */
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Normalizes any token key or category name into a clean kebab-case identifier.
 * @param {string} str - Raw token key
 * @returns {string} Sanitized kebab-case string
 */
function toKebabCase(str) {
  return camelToKebab(str)
    .replace(/\(base\)/gi, 'base')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strips redundant category terms to produce clean, legible variable names.
 * @param {string} category - Category string (e.g., 'primary color palette')
 * @returns {string} Cleaned category name
 */
function cleanCategoryName(category) {
  return category
    .replace(/\b(color roles|color palette|color pallete|key colors|spacing collection)\b/gi, '')
    .trim();
}

/**
 * Formats hex color strings. Converts 8-character hex (#RRGGBBAA) to 6-character (#RRGGBB) if alpha is 'ff'.
 * @param {string} hex - Hex color string
 * @param {boolean} normalizeHex - Whether to trim trailing FF alpha
 * @returns {string} Formatted hex string
 */
function formatHexColor(hex, normalizeHex = true) {
  if (typeof hex !== 'string') return hex;
  let color = hex.trim();
  if (normalizeHex && color.startsWith('#') && color.length === 9 && color.toLowerCase().endsWith('ff')) {
    return color.slice(0, 7);
  }
  return color;
}

/**
 * Maps a full JSON path array to a standardized CSS custom property name.
 * Eliminates redundant adjacent terms (e.g. `primary-primary100` -> `primary-100`).
 * 
 * Rules:
 * - primitive colors -> --primitive-...
 * - color roles -> --color-role-...
 * - spacing collection -> --spacing-...
 * - typography -> --typography-...
 * - effect -> --effect-...
 * 
 * @param {string[]} pathArray - Full object path array from JSON root
 * @returns {string} Formatted CSS variable name (e.g. '--color-role-primary-container')
 */
function generateCSSVarName(pathArray) {
  const rootSection = pathArray[0];
  const subCategories = pathArray.slice(1, -1).map(cleanCategoryName).map(toKebabCase).filter(Boolean);
  const leafKey = toKebabCase(pathArray[pathArray.length - 1]);

  let prefix = '';
  switch (rootSection.toLowerCase()) {
    case 'primitive colors':
      prefix = 'primitive';
      break;
    case 'color roles':
      prefix = 'color-role';
      break;
    case 'spacing collection':
      prefix = 'spacing';
      break;
    case 'typography':
      prefix = 'typography';
      break;
    case 'effect':
      prefix = 'effect';
      break;
    default:
      prefix = toKebabCase(rootSection);
      break;
  }

  const rawParts = [prefix, ...subCategories, leafKey].filter(Boolean);
  
  // Deduplicate adjacent redundant terms
  const result = [];
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    const prev = result[result.length - 1];

    if (prev) {
      if (part === prev) continue;
      // Handle palette numbers e.g. prev='primary', part='primary90' => '90'
      if (part.startsWith(prev) && /^[0-9]+$/.test(part.slice(prev.length))) {
        result.push(part.slice(prev.length));
        continue;
      }
      // Handle prefixed terms e.g. prev='primary', part='primary-container' => 'container'
      if (part.startsWith(prev + '-')) {
        result.push(part.slice(prev.length + 1));
        continue;
      }
    }
    result.push(part);
  }

  return '--' + result.join('-');
}

// ============================================================================
// TOKEN PARSER & ALIAS RESOLVER
// ============================================================================

/**
 * Class representing the Design Token Converter
 */
class TokenConverter {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.inputPath Path to tokens JSON
   * @param {string} options.outputPath Path to output CSS
   * @param {string} options.selector CSS selector scope
   * @param {boolean} options.resolveAliases Whether to resolve aliases to raw values
   * @param {boolean} options.formatHex Whether to trim FF from 8-digit hex colors
   */
  constructor(options) {
    this.options = options;
    this.tokenMap = new Map(); // Key: dot-path string, Value: Token Metadata
    this.varNameMap = new Map(); // Key: dot-path string, Value: CSS variable name
    this.sections = {
      primitives: [],
      roles: [],
      spacing: [],
      typography: [],
      effects: [],
      others: []
    };
  }

  /**
   * Loads and parses design tokens JSON file.
   */
  loadTokens() {
    if (!fs.existsSync(this.options.inputPath)) {
      throw new Error(`Input file not found at path: ${this.options.inputPath}`);
    }
    const rawData = fs.readFileSync(this.options.inputPath, 'utf8');
    this.rawTokens = JSON.parse(rawData);
    this._traverseAndCollect(this.rawTokens, []);
  }

  /**
   * Recursively traverses JSON tree to discover and index design tokens.
   * @private
   * @param {Object} node Current JSON node
   * @param {string[]} currentPath Current path array
   */
  _traverseAndCollect(node, currentPath) {
    if (!node || typeof node !== 'object') return;

    // Check if node is a token leaf
    const isLeafToken = node.value !== undefined && (node.type !== undefined || typeof node.value === 'object');

    if (isLeafToken) {
      const dotPath = currentPath.join('.');
      const cssVarName = generateCSSVarName(currentPath);

      const tokenData = {
        path: currentPath,
        dotPath: dotPath,
        cssVarName: cssVarName,
        value: node.value,
        type: node.type,
        description: node.description || null,
        extensions: node.extensions || null
      };

      this.tokenMap.set(dotPath, tokenData);
      this.varNameMap.set(dotPath, cssVarName);
    } else {
      for (const key of Object.keys(node)) {
        this._traverseAndCollect(node[key], [...currentPath, key]);
      }
    }
  }

  /**
   * Processes collected tokens and builds formatted CSS variable definitions.
   */
  processTokens() {
    for (const [dotPath, token] of this.tokenMap.entries()) {
      const rootSection = token.path[0].toLowerCase();

      if (rootSection === 'primitive colors') {
        const cssVal = formatHexColor(token.value, this.options.formatHex);
        this.sections.primitives.push({
          varName: token.cssVarName,
          value: cssVal,
          description: token.description,
          path: token.dotPath
        });
      } else if (rootSection === 'color roles') {
        let cssVal;
        const isAlias = typeof token.value === 'string' && token.value.startsWith('{') && token.value.endsWith('}');

        if (isAlias) {
          const targetDotPath = token.value.slice(1, -1);
          const targetVarName = this.varNameMap.get(targetDotPath);
          const targetToken = this.tokenMap.get(targetDotPath);

          if (this.options.resolveAliases && targetToken) {
            cssVal = formatHexColor(targetToken.value, this.options.formatHex);
          } else if (targetVarName) {
            cssVal = `var(${targetVarName})`;
          } else {
            cssVal = token.value; // Fallback if reference missing
          }
        } else {
          cssVal = formatHexColor(token.value, this.options.formatHex);
        }

        this.sections.roles.push({
          varName: token.cssVarName,
          value: cssVal,
          rawAlias: token.value,
          description: token.description,
          path: token.dotPath
        });
      } else if (rootSection === 'spacing collection') {
        const numVal = Number(token.value);
        const cssVal = isNaN(numVal) ? token.value : (numVal === 0 ? '0' : `${numVal}px`);
        this.sections.spacing.push({
          varName: token.cssVarName,
          value: cssVal,
          description: token.description,
          path: token.dotPath
        });
      } else if (rootSection === 'effect') {
        let cssVal = token.value;
        if (typeof token.value === 'object' && token.value !== null) {
          const { offsetX = 0, offsetY = 0, radius = 0, spread = 0, color = '#000000' } = token.value;
          const formattedColor = formatHexColor(color, this.options.formatHex);
          cssVal = `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${formattedColor}`;
        }
        this.sections.effects.push({
          varName: token.cssVarName,
          value: cssVal,
          description: token.description,
          path: token.dotPath
        });
      }
    }

    // Process typography section (composite structure)
    this._processTypography();
  }

  /**
   * Processes typography composite tokens into granular and shorthand CSS variables.
   * @private
   */
  _processTypography() {
    const rawTypography = this.rawTokens['typography'];
    if (!rawTypography || typeof rawTypography !== 'object') return;

    for (const [variantName, props] of Object.entries(rawTypography)) {
      if (typeof props !== 'object' || props === null) continue;

      const variantKebab = toKebabCase(variantName);
      const varPrefix = `--typography-${variantKebab}`;

      const fontSize = props.fontSize?.value ? `${props.fontSize.value}px` : null;
      const fontFamily = props.fontFamily?.value ? `"${props.fontFamily.value}", sans-serif` : null;
      const fontWeight = props.fontWeight?.value ? `${props.fontWeight.value}` : null;
      const lineHeight = props.lineHeight?.value ? `${props.lineHeight.value}px` : null;
      const letterSpacing = props.letterSpacing?.value !== undefined ? `${props.letterSpacing.value}px` : null;
      const textDecoration = props.textDecoration?.value || null;
      const fontStyle = props.fontStyle?.value || null;

      // Add individual property variables
      if (fontSize) this.sections.typography.push({ varName: `${varPrefix}-font-size`, value: fontSize });
      if (fontFamily) this.sections.typography.push({ varName: `${varPrefix}-font-family`, value: fontFamily });
      if (fontWeight) this.sections.typography.push({ varName: `${varPrefix}-font-weight`, value: fontWeight });
      if (lineHeight) this.sections.typography.push({ varName: `${varPrefix}-line-height`, value: lineHeight });
      if (letterSpacing) this.sections.typography.push({ varName: `${varPrefix}-letter-spacing`, value: letterSpacing });
      if (fontStyle && fontStyle !== 'normal') this.sections.typography.push({ varName: `${varPrefix}-font-style`, value: fontStyle });
      if (textDecoration && textDecoration !== 'none') this.sections.typography.push({ varName: `${varPrefix}-text-decoration`, value: textDecoration });

      // Add shorthand composite font variable if core properties exist
      if (fontWeight && fontSize && lineHeight && fontFamily) {
        const shorthand = `${fontWeight} ${fontSize}/${lineHeight} ${fontFamily}`;
        this.sections.typography.push({ varName: varPrefix, value: shorthand, isShorthand: true });
      }
    }
  }

  /**
   * Generates the complete output CSS content string.
   * @returns {string} Formatted CSS document
   */
  generateCSS() {
    const selector = this.options.selector || ':root';
    const timestamp = new Date().toISOString();

    let css = `/**
 * DESIGN TOKENS CSS VARIABLES
 * Generated automatically from: ${path.basename(this.options.inputPath)}
 * Generated at: ${timestamp}
 *
 * ============================================================================
 * ARCHITECTURAL GUIDELINES ON THE COLOR SYSTEM
 * ============================================================================
 * 1. PRIMITIVE COLORS (--primitive-*):
 *    Foundational color tokens (palettes & key colors).
 *    ⚠️ DO NOT USE DIRECTLY IN UI COMPONENTS.
 *    These serve strictly as palette reference definitions.
 *
 * 2. COLOR ROLES (--color-role-*):
 *    Semantic design tokens mapped to UI component intent (primary, surface, error, container, outline).
 *    ✅ ALWAYS USE THESE IN UI COMPONENTS & APP STYLES.
 *    These reference the primitive color variables via var(--primitive-...).
 * ============================================================================
 */

${selector} {
`;

    // Section 1: Primitive Colors
    css += `  /* ==========================================================================
   * 1. PRIMITIVE COLORS (FOUNDATIONAL - DO NOT USE DIRECTLY IN UI)
   * ========================================================================== */\n`;
    for (const item of this.sections.primitives) {
      css += `  ${item.varName}: ${item.value};\n`;
    }
    css += `\n`;

    // Section 2: Color Roles
    css += `  /* ==========================================================================
   * 2. COLOR ROLES (SEMANTIC - USE THESE FOR ALL UI COMPONENTS)
   * ========================================================================== */\n`;
    for (const item of this.sections.roles) {
      const comment = item.rawAlias ? ` /* maps to ${item.rawAlias} */` : '';
      css += `  ${item.varName}: ${item.value};${comment}\n`;
    }
    css += `\n`;

    // Section 3: Spacing
    css += `  /* ==========================================================================
   * 3. SPACING COLLECTION
   * ========================================================================== */\n`;
    for (const item of this.sections.spacing) {
      css += `  ${item.varName}: ${item.value};\n`;
    }
    css += `\n`;

    // Section 4: Typography
    css += `  /* ==========================================================================
   * 4. TYPOGRAPHY
   * ========================================================================== */\n`;
    for (const item of this.sections.typography) {
      const comment = item.isShorthand ? ` /* Shorthand: font */` : '';
      css += `  ${item.varName}: ${item.value};${comment}\n`;
    }
    css += `\n`;

    // Section 5: Effects / Shadows
    css += `  /* ==========================================================================
   * 5. EFFECTS & SHADOWS
   * ========================================================================== */\n`;
    for (const item of this.sections.effects) {
      css += `  ${item.varName}: ${item.value};\n`;
    }

    css += `}\n`;
    return css;
  }

  /**
   * Executes token conversion and writes output CSS file to disk.
   */
  run() {
    console.log(`\n==================================================`);
    console.log(`🎨 Design Tokens to CSS Variables Converter`);
    console.log(`==================================================`);
    console.log(`Reading input tokens from: ${this.options.inputPath}`);
    
    this.loadTokens();
    this.processTokens();
    const cssContent = this.generateCSS();

    // Ensure target directory exists
    const outDir = path.dirname(this.options.outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(this.options.outputPath, cssContent, 'utf8');

    console.log(`\nConversion Summary:`);
    console.log(`  - Primitive Color Tokens : ${this.sections.primitives.length}`);
    console.log(`  - Color Role Tokens      : ${this.sections.roles.length}`);
    console.log(`  - Spacing Tokens         : ${this.sections.spacing.length}`);
    console.log(`  - Typography Tokens      : ${this.sections.typography.length}`);
    console.log(`  - Effect/Shadow Tokens   : ${this.sections.effects.length}`);
    console.log(`\nSuccess! Output saved to: ${this.options.outputPath}`);
    console.log(`==================================================\n`);
  }
}

// ============================================================================
// SELF-TEST SUITE
// ============================================================================

function runSelfTests(options) {
  console.log(`\n🧪 Running Design Tokens Converter Self-Tests...`);
  const converter = new TokenConverter(options);
  converter.loadTokens();
  converter.processTokens();

  let errors = 0;

  // Test 1: Check primitive colors exist
  if (converter.sections.primitives.length === 0) {
    console.error(`❌ Test Failed: Primitive colors count is 0.`);
    errors++;
  } else {
    console.log(`✅ Test Passed: Found ${converter.sections.primitives.length} primitive color tokens.`);
  }

  // Test 2: Check color roles resolution
  let unmappedRoles = 0;
  for (const role of converter.sections.roles) {
    if (role.value.startsWith('{') && role.value.endsWith('}')) {
      unmappedRoles++;
    }
  }
  if (unmappedRoles > 0) {
    console.error(`❌ Test Failed: ${unmappedRoles} color roles failed to resolve to CSS variables.`);
    errors++;
  } else {
    console.log(`✅ Test Passed: 100% of color roles correctly mapped to primitive var(...) references.`);
  }

  // Test 3: Check spacing values
  if (converter.sections.spacing.length === 0) {
    console.error(`❌ Test Failed: Spacing collection count is 0.`);
    errors++;
  } else {
    console.log(`✅ Test Passed: Found ${converter.sections.spacing.length} spacing tokens.`);
  }

  // Test 4: Check typography shorthand
  const shorthandCount = converter.sections.typography.filter(t => t.isShorthand).length;
  if (shorthandCount === 0) {
    console.error(`❌ Test Failed: No typography shorthand variables generated.`);
    errors++;
  } else {
    console.log(`✅ Test Passed: Generated ${shorthandCount} composite typography shorthand rules.`);
  }

  if (errors === 0) {
    console.log(`\n🎉 All tests passed successfully!\n`);
  } else {
    console.error(`\n⚠️ Self-test completed with ${errors} error(s).\n`);
    process.exit(1);
  }
}

// ============================================================================
// CLI ARGUMENT PARSER & ENTRY POINT
// ============================================================================

function parseCLIArgs() {
  const args = process.argv.slice(2);
  const options = {
    inputPath: path.resolve(process.cwd(), 'design-tokens.tokens.json'),
    outputPath: path.resolve(process.cwd(), 'design-tokens.css'),
    selector: ':root',
    resolveAliases: false,
    formatHex: true,
    runTest: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      console.log(`
Design Tokens to CSS Variables Converter CLI
--------------------------------------------
Converts Figma design-tokens.tokens.json into production-ready CSS Custom Properties.

Usage:
  node convert-tokens.js [options]

Options:
  -i, --input <path>       Input tokens JSON file path (default: ./design-tokens.tokens.json)
  -o, --output <path>      Output CSS file path (default: ./design-tokens.css)
  -s, --selector <scope>   CSS selector scope for variables (default: :root)
  --resolve-aliases        Resolve color role aliases to raw hex values instead of var(...)
  --no-format-hex          Preserve 8-digit hex values without trimming 'FF' alpha
  -t, --test               Run self-test validation suite
  -h, --help               Show this help message
`);
      process.exit(0);
    } else if (arg === '-i' || arg === '--input') {
      options.inputPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '-o' || arg === '--output') {
      options.outputPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '-s' || arg === '--selector') {
      options.selector = args[++i];
    } else if (arg === '--resolve-aliases') {
      options.resolveAliases = true;
    } else if (arg === '--no-format-hex') {
      options.formatHex = false;
    } else if (arg === '-t' || arg === '--test') {
      options.runTest = true;
    }
  }

  return options;
}

if (require.main === module) {
  const options = parseCLIArgs();
  if (options.runTest) {
    runSelfTests(options);
  } else {
    const converter = new TokenConverter(options);
    converter.run();
  }
}

module.exports = { TokenConverter, generateCSSVarName, formatHexColor };
