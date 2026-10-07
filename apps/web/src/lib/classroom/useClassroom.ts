// @spec docs/RUNTIME.md §2 / docs/PLAN.md (Phase 1C)
// 把 Player 接到 React：状态、字幕、幻灯片、焦点、交互、TTS 全部由 hook 管理。
"use client";

import * as React from "react";
import { Player } from "@aiclassroom/runtime";
import type { InteractAnswer, RuntimeDeps } from "@aiclassroom/runtime";
import type {
  Action,
  Lesson,
  PlaybackRate,
  PlaybackState,
  Role,
  Slide,
} from "@aiclassroom/types";
import { createWebSpeechTts } from "./tts";

export type InteractPrompt = {
  action: Extract<Action, { type: "INTERACT" }>;
  answer?: InteractAnswer;
};

export interface ClassroomApi {
  state: PlaybackState;
  currentAction: Action | null;
  currentRole: Role | undefined;
  currentSlide: Slide | undefined;
  subtitle: string;
  focusElementId: string | undefined;
  interact: InteractPrompt | null;
  controls: {
    play: () => void;
    pause: () => void;
    resume: () => void;
    next: () => void;
    gotoScene: (i: number) => void;
    stop: () => void;
    setRate: (r: PlaybackRate) => void;
  };
  submitInteract: (answer: InteractAnswer) => void;
}

const INITIAL_STATE: PlaybackState = {
  status: "idle",
  currentSceneIndex: 0,
  currentActionIndex: 0,
  elapsedMs: 0,
  playbackRate: 1,
  errors: [],
};

export function useClassroom(lesson: Lesson): ClassroomApi {
  const [state, setState] = React.useState<PlaybackState>(INITIAL_STATE);
  const [currentAction, setCurrentAction] = React.useState<Action | null>(null);
  const [currentSlideId, setCurrentSlideId] = React.useState<string | undefined>(
    undefined,
  );
  const [subtitle, setSubtitle] = React.useState("");
  const [focusElementId, setFocusElementId] = React.useState<string | undefined>(
    undefined,
  );
  const [interact, setInteract] = React.useState<InteractPrompt | null>(null);

  const ttsRef = React.useRef(createWebSpeechTts());
  const playerRef = React.useRef<Player | null>(null);
  const interactResolveRef = React.useRef<((a: InteractAnswer) => void) | null>(null);

  if (playerRef.current === null) {
    const deps: RuntimeDeps = {
      speak: (roleId, text, opts, signal) =>
        ttsRef.current.speak(roleId, text, opts, signal),
      showSlide: (id) => {
        setCurrentSlideId(id);
        setFocusElementId(undefined);
      },
      focusElement: (id) => setFocusElementId(id),
      drawWhiteboard: () => {
        /* MVP：白板痕迹不在 UI 持久化 */
      },
      promptInteract: (action) =>
        new Promise<InteractAnswer>((resolve) => {
          interactResolveRef.current = resolve;
          setInteract({ action });
        }),
      runDiscuss: async () => {
        // SIMPLIFIED IMPLEMENTATION（Phase 2）：以中性过渡推进，不编造学生发言
        await ttsRef.current.speak(
          "",
          "现在请大家一起讨论这个话题。",
          { lang: lesson.language },
          undefined,
        );
      },
      wait: (ms, signal) =>
        new Promise<void>((resolve) => {
          const t = setTimeout(resolve, ms);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        }),
    };
    playerRef.current = new Player({ lesson, deps });
  }

  // 后台生成的新场景动态注入
  React.useEffect(() => {
    playerRef.current?.setLesson(lesson);
  }, [lesson]);

  React.useEffect(() => {
    const player = playerRef.current!;
    const offState = player.subscribe(setState);
    const offAction = player.onAction((action) => {
      setCurrentAction(action);
      if (action && action.type === "SPEECH") setSubtitle(action.text);
      else if (action && action.type === "INTERACT") setSubtitle(action.prompt);
      else if (action === null) setSubtitle("");
    });
    return () => {
      offState();
      offAction();
    };
  }, []);

  const currentSlide = React.useMemo<Slide | undefined>(() => {
    if (currentSlideId === undefined) return undefined;
    for (const s of lesson.scenes) {
      if (s.slide && s.slide.id === currentSlideId) return s.slide;
    }
    return undefined;
  }, [lesson, currentSlideId]);

  const currentRole = React.useMemo<Role | undefined>(() => {
    if (!currentAction) return undefined;
    const rid = "roleId" in currentAction ? currentAction.roleId : undefined;
    return rid ? lesson.roles.find((r) => r.id === rid) : undefined;
  }, [lesson, currentAction]);

  const controls = React.useMemo<ClassroomApi["controls"]>(
    () => ({
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      resume: () => playerRef.current?.resume(),
      next: () => playerRef.current?.next(),
      gotoScene: (i) => playerRef.current?.gotoScene(i),
      stop: () => playerRef.current?.stop(),
      setRate: (r) => playerRef.current?.setRate(r),
    }),
    [],
  );

  const submitInteract = React.useCallback((answer: InteractAnswer) => {
    interactResolveRef.current?.(answer);
    interactResolveRef.current = null;
    setInteract(null);
  }, []);

  return {
    state,
    currentAction,
    currentRole,
    currentSlide,
    subtitle,
    focusElementId,
    interact,
    controls,
    submitInteract,
  };
}
