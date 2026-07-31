"use client";

import { MODULES, PERMISSIONS_BY_MODULE, type PermissionKey } from "@/lib/permissions/registry";

type RoleDefaultProps = {
  mode: "role-default";
  selected: Set<PermissionKey>;
  onChange: (next: Set<PermissionKey>) => void;
  disabled?: boolean;
};

type UserOverrideProps = {
  mode: "user-override";
  roleDefaults: Set<PermissionKey>;
  overrides: Map<PermissionKey, "grant" | "revoke">;
  onChange: (next: Map<PermissionKey, "grant" | "revoke">) => void;
};

type Props = RoleDefaultProps | UserOverrideProps;

export default function PermissionsEditor(props: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MODULES.map((module) => {
        const perms = PERMISSIONS_BY_MODULE[module.key];
        if (!perms || perms.length === 0) return null;
        return (
          <div
            key={module.key}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-zinc-900">
              {module.label}
            </h3>
            <div className="mt-3 space-y-2">
              {perms.map((perm) => {
                if (props.mode === "role-default") {
                  const checked = props.selected.has(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-2 text-sm ${
                        props.disabled
                          ? "text-zinc-400"
                          : "cursor-pointer text-zinc-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={props.disabled}
                        onChange={() => {
                          const next = new Set(props.selected);
                          if (checked) next.delete(perm.key);
                          else next.add(perm.key);
                          props.onChange(next);
                        }}
                        className="h-4 w-4 rounded border-zinc-300 accent-accent"
                      />
                      {perm.label}
                    </label>
                  );
                }

                const override = props.overrides.get(perm.key);
                const inherited = props.roleDefaults.has(perm.key);
                const effective = override
                  ? override === "grant"
                  : inherited;

                return (
                  <div key={perm.key} className="flex items-center gap-2 text-sm">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-zinc-700">
                      <input
                        type="checkbox"
                        checked={effective}
                        onChange={() => {
                          const nextEffective = !effective;
                          const next = new Map(props.overrides);
                          if (nextEffective === inherited) {
                            next.delete(perm.key);
                          } else {
                            next.set(perm.key, nextEffective ? "grant" : "revoke");
                          }
                          props.onChange(next);
                        }}
                        className="h-4 w-4 rounded border-zinc-300 accent-accent"
                      />
                      {perm.label}
                    </label>
                    {override && (
                      <>
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                          Prilagojeno
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Map(props.overrides);
                            next.delete(perm.key);
                            props.onChange(next);
                          }}
                          className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700"
                        >
                          Ponastavi
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
