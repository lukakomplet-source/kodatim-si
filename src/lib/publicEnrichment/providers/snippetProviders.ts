import { CONFIDENCE } from "../types";
import { createSnippetProvider } from "./snippetProvider";

export const googleMapsProvider = createSnippetProvider({
  id: "google_maps",
  label: "Google Maps",
  priority: 5,
  hostMatch: "google.com/maps",
  fallbackQuerySuffix: '"Google Maps"',
  allowedFields: ["phone", "address_street", "address_city", "address_region", "website"],
  confidence: CONFIDENCE.GOOGLE_MAPS_SNIPPET,
});

export const linkedinProvider = createSnippetProvider({
  id: "linkedin_snippet",
  label: "LinkedIn",
  priority: 6,
  hostMatch: "linkedin.com",
  fallbackQuerySuffix: "LinkedIn",
  allowedFields: ["industry", "employees_count", "website"],
  confidence: CONFIDENCE.LINKEDIN_SNIPPET,
});

export const facebookProvider = createSnippetProvider({
  id: "facebook_snippet",
  label: "Facebook",
  priority: 7,
  hostMatch: "facebook.com",
  fallbackQuerySuffix: "Facebook",
  allowedFields: ["phone", "address_city", "website"],
  confidence: CONFIDENCE.FACEBOOK_SNIPPET,
});

export const instagramProvider = createSnippetProvider({
  id: "instagram_snippet",
  label: "Instagram",
  priority: 8,
  hostMatch: "instagram.com",
  fallbackQuerySuffix: "Instagram",
  allowedFields: ["website", "industry"],
  confidence: CONFIDENCE.INSTAGRAM_SNIPPET,
});
