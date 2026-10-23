import { homedir } from "node:os";
import { join } from "node:path";
import type { TargetConfig } from "../config.ts";
import type { Posted } from "../types.ts";
import type { Context, Target } from "./index.ts";

/**
 * A Facebook group, posted to with a real signed-in browser: Meta removed
 * the API for posting to groups in 2024. Config: { "type": "facebook-group",
 * "group_url": "https://www.facebook.com/groups/<id>",
 * "profile_dir": "~/.local/share/fanout/facebook-profile",
 * "mode"?: "assist" | "auto", "timeout_s"?: 600 }. `assist` (the default)
 * fills in the post and waits for a person to click Post; `auto` clicks it
 * unattended. See docs/adr/0003-facebook-groups-through-a-browser.md.
 */

/** Facebook's markup has no stable API for this and these selectors drift; update them when Facebook changes its DOM. */
export const SELECTORS = {
  loginForm: '#login_form, form[data-testid="royal_login_form"]',
  composerOpen: '[aria-label="Create a public post…"], [aria-label="Write something…"]',
  composerBox: 'div[contenteditable="true"][role="textbox"]',
  postButton: 'div[aria-label="Post"][role="button"]',
};

/** The browser interactions post() needs; a fake drives it in tests, never a real browser. */
export interface FacebookPage {
  open(url: string): Promise<void>;
  isSignedIn(): Promise<boolean>;
  fill(message: string): Promise<void>;
  clickPost(): Promise<void>;
  /** Resolves true once the composer closes (the post went through), false on timeout. */
  waitForPosted(timeoutMs: number): Promise<boolean>;
  close(): Promise<void>;
}

/** The posting logic, independent of how the page was launched, so tests drive it with a fake. */
export async function postToPage(page: FacebookPage, cfg: TargetConfig, ctx: Context): Promise<Posted> {
  try {
    await page.open(cfg.group_url as string);
    if (!(await page.isSignedIn())) throw new Error("not signed in: run fanout login <target> first");
    await page.fill(ctx.message);
    const mode = cfg.mode === "auto" ? "auto" : "assist";
    const timeoutS = typeof cfg.timeout_s === "number" ? cfg.timeout_s : 600;
    if (mode === "auto") {
      await page.clickPost();
    } else {
      console.log(`Review the post in the browser and click Post (waiting up to ${timeoutS}s)…`);
    }
    if (!(await page.waitForPosted(timeoutS * 1000))) throw new Error("timed out waiting for Post");
    return {};
  } finally {
    await page.close();
  }
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

/** The real Playwright surface this file uses, kept minimal so the type doesn't need @types/playwright installed. */
interface PlaywrightModule {
  chromium: {
    launchPersistentContext(dir: string, opts: { headless: boolean }): Promise<RealContext>;
  };
}
interface RealContext {
  pages(): RealPage[];
  newPage(): Promise<RealPage>;
  close(): Promise<void>;
  on(event: "close", listener: () => void): void;
}
interface RealPage {
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string, opts: { timeout: number; state?: "attached" | "detached" }): Promise<unknown>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  $(selector: string): Promise<unknown>;
}

async function importPlaywright(): Promise<unknown> {
  // @ts-ignore optional dependency: may not be installed (see package.json optionalDependencies)
  return import('playwright');
}

/** Exported so tests can force the "not installed" path without ever installing or importing Playwright. */
export async function loadPlaywright(importer: () => Promise<unknown> = importPlaywright): Promise<PlaywrightModule> {
  try {
    return (await importer()) as unknown as PlaywrightModule;
  } catch {
    throw new Error("facebook-group needs Playwright: npm install playwright && npx playwright install chromium");
  }
}

function wrapPage(page: RealPage, ctx: RealContext): FacebookPage {
  return {
    async open(url) {
      await page.goto(url);
    },
    async isSignedIn() {
      return (await page.$(SELECTORS.loginForm)) === null;
    },
    async fill(message) {
      await page.click(SELECTORS.composerOpen);
      await page.waitForSelector(SELECTORS.composerBox, { timeout: 30_000 });
      await page.fill(SELECTORS.composerBox, message);
    },
    async clickPost() {
      await page.click(SELECTORS.postButton);
    },
    async waitForPosted(timeoutMs) {
      try {
        await page.waitForSelector(SELECTORS.composerBox, { timeout: timeoutMs, state: "detached" });
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await ctx.close();
    },
  };
}

async function launch(profileDir: string): Promise<FacebookPage> {
  const playwright = await loadPlaywright();
  const ctx = await playwright.chromium.launchPersistentContext(expandHome(profileDir), { headless: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return wrapPage(page, ctx);
}

/** Opens group_url in the target's persistent profile, headful, so a person can sign in once. */
export async function login(cfg: TargetConfig): Promise<void> {
  const playwright = await loadPlaywright();
  const ctx = await playwright.chromium.launchPersistentContext(expandHome(cfg.profile_dir as string), {
    headless: false,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(cfg.group_url as string);
  await new Promise<void>((resolve) => ctx.on("close", resolve));
}

export const facebookGroup: Target = {
  check(cfg) {
    const url = typeof cfg.group_url === "string" ? cfg.group_url : "";
    if (!/^https:\/\/(www\.)?facebook\.com\/groups\//.test(url))
      return ["group_url must be a facebook.com/groups/... URL"];
    return [];
  },
  async post(_item, cfg, ctx) {
    const page = await launch(cfg.profile_dir as string);
    return postToPage(page, cfg, ctx);
  },
  login,
};
