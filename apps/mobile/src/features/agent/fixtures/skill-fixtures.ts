export type SkillCatalogItem = {
  name: string;
  description: string;
};

export const skillCatalogFixtures: SkillCatalogItem[] = [
  {
    name: 'better-ui',
    description: 'Polish surfaces, icons, and motion with exact design tokens.',
  },
  {
    name: 'frontend-ui-engineering',
    description: 'Production-quality accessible responsive UI patterns.',
  },
  {
    name: 'grill-me',
    description: 'Stress-test plans and product decisions with structured questions.',
  },
  {
    name: 'humanizer-zh',
    description: 'Remove AI writing patterns from Chinese copy.',
  },
];
