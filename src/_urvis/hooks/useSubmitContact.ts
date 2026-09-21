'use client';

import { useMutation } from '@tanstack/react-query';

export type UrvisContactPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
};

async function postUrvisContact(payload: UrvisContactPayload): Promise<{ ok: true }> {
  const res = await fetch('/api/urvis-contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Napaka pri pošiljanju povpraševanja.');
  }
  return res.json();
}

/** Drop-in replacement for the original `@workspace/api-client-react` hook, same {data} mutate shape. */
export function useSubmitContact() {
  return useMutation({
    mutationFn: (vars: { data: UrvisContactPayload }) => postUrvisContact(vars.data),
  });
}
