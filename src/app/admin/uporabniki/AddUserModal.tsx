"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { createUser, type CreateUserState } from "./actions";
import type { RoleOption, UserStatus } from "./query";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Ustvarjam …" : "Ustvari uporabnika"}
    </button>
  );
}

const initialState: CreateUserState = {};
const DEFAULT_STATUS: UserStatus = "active";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none";

export default function AddUserModal({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"password" | "invite">("invite");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [state, formAction] = useActionState(createUser, initialState);

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
      >
        <Plus className="h-4 w-4" />
        Nov uporabnik
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Dodaj uporabnika"
        maxWidthClassName="max-w-xl"
      >
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700">Ime</label>
              <input name="firstName" required className={INPUT_CLASS} />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Priimek</label>
              <input name="lastName" required className={INPUT_CLASS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700">Email</label>
              <input name="email" type="email" required className={INPUT_CLASS} />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Telefon</label>
              <input name="phone" className={INPUT_CLASS} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Podjetje</label>
            <input name="company" className={INPUT_CLASS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700">Vloga</label>
              <select
                name="roleId"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={INPUT_CLASS}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {selectedRole?.key === "partner" && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Portal za partnerje (/partner) za novo dodane partnerje še
                  ni na voljo — sledi v naslednji fazi.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Status</label>
              <select
                name="status"
                defaultValue={DEFAULT_STATUS}
                className={INPUT_CLASS}
              >
                <option value="active">Aktiven</option>
                <option value="inactive">Neaktiven</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-1">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("invite")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "invite"
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Pošlji povabilo po emailu
              </button>
              <button
                type="button"
                onClick={() => setMode("password")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "password"
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Nastavi geslo zdaj
              </button>
            </div>
          </div>
          <input type="hidden" name="mode" value={mode} />

          {mode === "password" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">Geslo</label>
                <input
                  name="password"
                  type="password"
                  required={mode === "password"}
                  minLength={8}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Potrdi geslo
                </label>
                <input
                  name="confirmPassword"
                  type="password"
                  required={mode === "password"}
                  minLength={8}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-emerald-600">Uporabnik je ustvarjen.</p>
          )}

          <SubmitButton />
        </form>
      </Modal>
    </>
  );
}
