/** Advanced WACRM dashboard features surfaced via signed deep-link / embed. */
export const WACRM_ADVANCED_FEATURES = {
  templates: {
    id: "templates",
    label: "Templates",
    description: "Create and sync Meta-approved WhatsApp templates",
    path: "/settings?tab=templates",
  },
  automations: {
    id: "automations",
    label: "Automation Builder",
    description: "Visual WhatsApp automations and keyword replies",
    path: "/automations",
  },
  flows: {
    id: "flows",
    label: "Flow Builder",
    description: "Conversational chatbot flows",
    path: "/flows",
  },
  ai: {
    id: "ai",
    label: "AI Assistant",
    description: "Knowledge base and inbound auto-reply",
    path: "/agents",
  },
  whatsapp: {
    id: "whatsapp",
    label: "Meta Configuration",
    description: "WhatsApp Business API connection",
    path: "/settings?tab=whatsapp",
  },
  team: {
    id: "team",
    label: "Team Management",
    description: "Invite agents and manage roles",
    path: "/settings?tab=members",
  },
} as const;

export type WacrmAdvancedFeatureId = keyof typeof WACRM_ADVANCED_FEATURES;

export function isWacrmAdvancedFeature(id: string): id is WacrmAdvancedFeatureId {
  return id in WACRM_ADVANCED_FEATURES;
}
