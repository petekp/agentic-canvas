import type { TemplateDefinition, TemplateId } from "@/types";

const registry = new Map<TemplateId, TemplateDefinition>();

export function registerTemplate(template: TemplateDefinition): void {
  registry.set(template.id, template);
}

export function unregisterTemplate(templateId: TemplateId): void {
  registry.delete(templateId);
}

export function getTemplate(templateId: TemplateId): TemplateDefinition | undefined {
  return registry.get(templateId);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(registry.values());
}

export function clearTemplates(): void {
  registry.clear();
}
