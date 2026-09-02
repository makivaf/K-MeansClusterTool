const measureLabels: Record<string, string> = {
  MMSE: "Mini-Mental State Examination",
  ADAS13: "ADAS-Cog13",
  LMI: "Logical Memory Immediate Recall",
  LMD: "Logical Memory Delayed Recall",
  TMT_A: "Trail Making Test A",
  TMT_B: "Trail Making Test B",
  CATEGORY_FLUENCY_ANIMALS: "Category Fluency — Animals",
  RAVLT_IMMEDIATE: "RAVLT Immediate Recall",
  RAVLT_DELAYED: "RAVLT Delayed Recall",
  RAVLT_FORGETTING: "RAVLT Forgetting Score",
  CDRSB: "Clinical Dementia Rating Sum of Boxes",
  FAQ: "Functional Activities Questionnaire",
  GDS: "Geriatric Depression Scale",
  BNT: "Boston Naming Test",
  NPIQ: "Neuropsychiatric Inventory Questionnaire"
};

export const getMeasureLabel = (measure: string): string => measureLabels[measure] ?? measure;
