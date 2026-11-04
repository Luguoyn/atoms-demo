import type { AppTemplate } from "./app-template";
import { POMODORO_TEMPLATE } from "./pomodoro";
import { TODO_TEMPLATE } from "./todo";

export type { AppTemplate } from "./app-template";
export { POMODORO_TEMPLATE, TODO_TEMPLATE };

const TODO_PATTERN = /待办|清单|任务|todo|to-do|打卡|习惯|计划|提醒/i;

/** Deterministic template selection for the offline demo agent. */
export function pickTemplate(message: string): AppTemplate {
  return TODO_PATTERN.test(message) ? TODO_TEMPLATE : POMODORO_TEMPLATE;
}
