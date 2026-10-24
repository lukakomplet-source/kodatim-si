"use client";

import { useEffect } from "react";
import { oznaciInterno } from "./interno";

/** Marks this browser as the team's, so its later views are never counted. */
export function OznaciInterno() {
  useEffect(() => oznaciInterno(), []);
  return null;
}
