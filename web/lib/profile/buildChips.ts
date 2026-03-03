/**
 * Build identity chips for IdentityStrip from profile VM.
 * Shared by /profile and /u/[username].
 */

import * as React from "react";
import {
  UserRound,
  Compass,
  CheckCircle2,
  Waves,
  Gamepad2,
  Disc,
  Disc3,
  Joystick,
  Clock,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getEraMeta } from "@/lib/eras";
import { ARCHETYPE_THEME, ERA_THEME } from "@/lib/identity/strip-themes";
import type { IdentityChip } from "@/app/components/identity/IdentityStrip";
import type { ProfileVm } from "./buildVm";

const ICON_MAP: Record<string, LucideIcon> = {
  UserRound,
  Compass,
  CheckCircle2,
  Waves,
  Gamepad2,
  Disc,
  Disc3,
  Joystick,
  Clock,
  Sparkles,
  Playstation: Gamepad2,
};

function iconFor(name: string): React.ReactNode {
  const Icon = ICON_MAP[name] ?? UserRound;
  return React.createElement(Icon, { className: "h-4 w-4" });
}

export function buildChips(vm: ProfileVm): IdentityChip[] {
  if (!vm.primaryArchetype?.key) return [];

  const archTheme = ARCHETYPE_THEME[vm.primaryArchetype.key];
  const topEraMeta = getEraMeta(vm.topEraKey);
  const eraTheme = vm.topEraKey ? (ERA_THEME[topEraMeta.key] ?? ERA_THEME.modern) : null;

  const chips: IdentityChip[] = [
    {
      key: `arch:${vm.primaryArchetype.key}`,
      label: vm.primaryArchetype.label ?? "Archetype",
      icon: iconFor(archTheme?.icon ?? "UserRound"),
      kind: "archetype",
      tier: vm.primaryArchetype.strength as "emerging" | "strong" | "core",
    },
  ];
  if (vm.topEraKey) {
    chips.push({
      key: `era:${vm.topEraKey}`,
      label: topEraMeta.label ?? "Top era",
      icon: iconFor(eraTheme?.icon ?? "Clock"),
      kind: "era",
      eraKey: topEraMeta.key,
    });
  }
  return chips;
}
