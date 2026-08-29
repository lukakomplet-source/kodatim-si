import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Zaganjalnik strani prejšnjo zgradbo preimenuje v .next_prejsnja (varnostna
    // kopija za vrnitev). Je strojno generirana koda in ne naša: brez tega
    // izjema eslint javi ~22.000 opozoril, med katerimi se resnične napake v
    // src/ preprosto izgubijo.
    ".next_prejsnja/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A standalone Node/Playwright project with its own tsconfig and its own
    // toolchain — linting it with the Next.js rules reports nothing useful.
    "worker-avtonet/**",
  ]),
]);

export default eslintConfig;
