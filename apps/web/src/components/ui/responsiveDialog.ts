/** Below `md` this is a bottom sheet. Callers add their own `md:` placement so desktop stays put. */
export const responsiveDialogContentClass =
  'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:right-0 max-md:z-50 max-md:h-auto max-md:max-h-[85dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto max-md:rounded-t-2xl max-md:rounded-b-none max-md:border-t max-md:border-zinc-800 max-md:border-l-0 max-md:bg-zinc-950 max-md:pb-[env(safe-area-inset-bottom)]';

export const sheetHandleClass = 'mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600 md:hidden';
