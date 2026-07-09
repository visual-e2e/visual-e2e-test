import { StepType } from "../types/step-type.enum.js";
import type { IStepHandler } from "../handlers/base.handler.js";
import { ClickHandler } from "../handlers/click.handler.js";
import { HoverHandler } from "../handlers/hover.handler.js";
import { InputHandler } from "../handlers/input.handler.js";
import { LinkHandler } from "../handlers/link.handler.js";
import { WaitHandler } from "../handlers/wait.handler.js";
import { ReadyHandler } from "../handlers/ready.handler.js";
import { ScrollHandler } from "../handlers/scroll.handler.js";
import { VerifyHandler } from "../handlers/verify.handler.js";
import { ScreenshotHandler } from "../handlers/screenshot.handler.js";
import { LogHandler } from "../handlers/log.handler.js";
import { KeyboardHandler } from "../handlers/keyboard.handler.js";
import { MacroHandler } from "../handlers/macro.handler.js";

export class HandlerRegistry {
  private handlers = new Map<StepType, IStepHandler>();

  register(handler: IStepHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: StepType): IStepHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`未注册的 StepType: ${type}`);
    }
    return handler;
  }
}

export function createHandlerRegistry(): HandlerRegistry {
  const registry = new HandlerRegistry();
  [
    new ClickHandler(),
    new HoverHandler(),
    new InputHandler(),
    new LinkHandler(),
    new WaitHandler(),
    new ReadyHandler(),
    new ScrollHandler(),
    new VerifyHandler(),
    new ScreenshotHandler(),
    new LogHandler(),
    new KeyboardHandler(),
  ].forEach((h) => registry.register(h));
  registry.register(new MacroHandler(registry));
  return registry;
}
