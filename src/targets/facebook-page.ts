import type { Target } from "./index.ts";
import { secret } from "./index.ts";

/**
 * A Facebook Page with the Graph API.
 * Config: { "type": "facebook-page", "page_id": "<numeric id>", "token_env": "FB_PAGE_TOKEN", "api_version"?: "v23.0" }.
 * Posts to a Facebook Page feed using the Graph API.
 */
export const facebookPage: Target = {
  check(cfg, env) {
    const errors: string[] = [];
    
    // Validate page_id is a non-empty string of digits
    if (typeof cfg.page_id !== "string" || !cfg.page_id) {
      errors.push("page_id must be a non-empty string");
    } else if (!/^\d+$/.test(cfg.page_id)) {
      errors.push("page_id must be a string of digits");
    }
    
    // Validate token_env names a set environment variable
    const tokenSecret = secret(cfg, "token_env", env);
    if (!tokenSecret.name) {
      errors.push("set token_env to the name of the environment variable holding the access token");
    } else if (!tokenSecret.value) {
      errors.push(`${tokenSecret.name} is not set`);
    }
    
    return errors;
  },
  
  async post(item, cfg, ctx) {
    const pageId = cfg.page_id as string;
    const apiVersion = cfg.api_version || "v23.0";
    const tokenSecret = secret(cfg, "token_env", ctx.env);
    const token = tokenSecret.value!;
    
    // Build the URL
    const url = `https://graph.facebook.com/${apiVersion}/${pageId}/feed`;
    
    // Prepare form-encoded body
    const body = new URLSearchParams({
      message: ctx.message,
      link: item.url,
      access_token: token,
    });
    
    const res = await ctx.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    
    if (!res.ok) {
      // Parse the JSON error from Facebook
      const errorJson = await res.json();
      const errorMessage = errorJson?.error?.message || `Facebook HTTP ${res.status}`;
      // Throw an error with the message but without the token
      throw new Error(errorMessage);
    }
    
    const result = (await res.json()) as { id?: string };
    return { remote: result.id ? `facebook:${result.id}` : undefined };
  },
};