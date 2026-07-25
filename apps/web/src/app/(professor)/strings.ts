// Professor route group strings (guide 3.4: sentence case, one job per string).
// The sign-in failure is the backend's one generic line, which never says
// whether the email or the password was the problem (backend 7.1).
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    signOut: "Sign out",
  },
  signIn: {
    title: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Password",
    action: "Sign in",
    failure: "Email or password is incorrect.",
  },
  dashboard: {
    greeting: (email: string) => `Signed in as ${email}.`,
    heading: "Your courses",
    empty: "Your courses will appear here once you create one.",
    newCourseLabel: "New course title",
    newCourseAction: "Create course",
  },
  course: {
    back: "All courses",
    heading: "Case studies",
    empty: "No case studies yet. Write your first one below.",
    draft: "Draft",
    published: "Published",
    open: "Open",
    publish: "Publish",
    unpublish: "Unpublish",
    newTitleLabel: "Title",
    newBodyLabel: "Body (Markdown, with $math$)",
    newAction: "Create case study",
    seatsLink: "Seats",
    importLink: "Import from PDF",
  },
  // The import-from-PDF door (guide 4.3). Decode reads the pages; the review
  // step where a professor confirms each detected problem and its figures is
  // Phase 4.4 proper and comes next, so this surface stops at "read".
  import: {
    title: "Import from PDF",
    back: "Back to course",
    intro:
      "Drop a PDF of problems with their solutions. We read it into drafts you confirm before anything reaches students.",
    dropPrompt: "Drag a PDF here, or",
    choose: "Choose a PDF",
    rejectedType: "That file is not a PDF.",
    rejectedTooLarge: "That PDF is over 60 MB.",
    rejectedEmpty: "That file is empty.",
    start: "Import this PDF",
    uploading: "Uploading your PDF…",
    reading: "Reading your PDF…",
    ready: (count: number) =>
      count === 1 ? "Read 1 page." : `Read ${count} pages.`,
    error: "That did not work. Check your connection and try again.",
    another: "Import another PDF",
    review: "Review the extracted problems",
  },
  // The import confirmation surface (guide 4.3): each detected problem beside its
  // source pages, confirmed into a draft before anything reaches students. The
  // AI proposes and the professor disposes.
  confirm: {
    title: "Review and confirm",
    back: "Back to course",
    progress: (confirmed: number, total: number) =>
      `${confirmed} of ${total} confirmed`,
    empty: "This import produced nothing to review.",
    allDone: "Every item is confirmed. They are drafts in your course now.",
    note: "Confirmed problems become drafts in your course. The rest are discarded after 30 days.",
    sourcePages: "Source pages",
    sourcePage: (index: number) => `Source page ${index}`,
    pageSpan: (span: string) => `Pages ${span}`,
    lowConfidence: "Low confidence",
    question: "Question",
    solution: "Solution",
    noSolution: "No solution was found for this problem.",
    edit: "Edit text",
    done: "Done editing",
    confirm: "Confirm",
    confirmed: "Confirmed",
    openDraft: "Open the draft",
    discard: "Discard",
    error: "That did not go through. Try again.",
    // Figure verbs, on a selected box (guide 4.3). Re-crop needs a server crop
    // endpoint that does not exist yet, so adjusting a crop is remove then redraw.
    figureHint:
      "Drag on a page to capture a figure the detector missed. Select a box to change or remove it.",
    markDecorative: "Mark decorative",
    markEssential: "Mark essential",
    removeFigure: "Remove figure",
    // Merge folds the next detected problem into this one (a question the
    // segmenter split); split is deferred until the corpus lands.
    mergeNext: "Merge with next",
    keys: "Move with j and k. Press a to confirm, e to edit.",
    split: "Split",
    splitSoon: "Splitting a joined problem is coming with the sample corpus.",
  },
  // The parameterization panel (guide 4.3, Phase 5.5). A parameter varies within
  // its range while the invariants keep the problem pedagogically the same.
  params: {
    heading: "Parameters",
    intro:
      "Mark the values that should vary between students. Invariants keep every variant asking the same thing.",
    empty: "No parameters yet. Add one, or let auto-parameterize propose a set.",
    add: "Add a parameter",
    name: "Name",
    type: "Type",
    typeNumber: "Number",
    typeInteger: "Whole number",
    typeChoice: "Choice",
    typeEntity: "Name or entity",
    baseLabel: "Base value",
    rangeFrom: "From",
    rangeTo: "To",
    step: "Step (optional)",
    options: "Choices (one per line)",
    description: "What it stands for (optional)",
    remove: "Remove",
    invariants: "Invariants",
    invariantPlaceholder: "e.g. The NPV must be positive in the base scenario",
    addInvariant: "Add an invariant",
    solutionMethod: "Solution method (optional)",
    save: "Save parameters",
    clear: "Clear all",
    saved: "Parameters saved.",
    error: "That did not save. Check the values and try again.",
    // The frozen-check block (guide 5.1): a value printed inside a figure.
    blockedHeading: "Some values appear inside a figure",
    blockedHatch:
      "To vary it anyway, mark that figure decorative on the import review, or edit the value out of the prose.",
    autoParameterize: "Auto-parameterize",
    autoPending: "Reading the problem and its figures…",
    autoError: "That did not work. Try again.",
    // The auto-parameterize review overlay (guide 4.3).
    proposalHeading: "Proposed parameters",
    proposalIntro:
      "Each highlighted value would vary. Review the ranges and reasons, then accept to load them into the form.",
    aiProposed: "AI-proposed. Review before you save.",
    rangeNumber: (from: number, to: number) => `${from} to ${to}`,
    rangeChoice: (count: number) => `${count} choices`,
    lockedTo: (value: string) => `${value}, locked to a figure`,
    accept: "Accept these",
    dismiss: "Dismiss",
  },
  // Preview variants and the flagged review queue (Phase 5.3 to 5.5, guide 4.4).
  variants: {
    previewHeading: "Preview variants",
    previewIntro:
      "Generate a few sample variants to see what students would get before you publish.",
    generate: "Generate preview variants",
    generating: "Generating…",
    seedLabel: (seed: number) => `Seed ${seed}`,
    flagged: "Flagged for review",
    generateError:
      "Generation did not start. Save the parameters for this case study first.",
    reviewLink: "Review flagged variants",
    // The review queue.
    reviewTitle: "Flagged variants",
    reviewBack: "Back to the case study",
    reviewEmpty: "No flagged variants. Every generated variant verified cleanly.",
    reviewIntro:
      "The independent re-solve disagreed with these. Compare them, then promote, edit, or discard.",
    generated: "Generation",
    reSolve: "Independent re-solve",
    noReSolve: "The re-solve produced nothing to compare.",
    answers: "Final answers",
    values: "Values",
    promote: "Promote",
    editSolution: "Edit solution",
    saveEdit: "Save",
    cancelEdit: "Cancel",
    discard: "Discard",
    discardBlocked: "This variant has submissions and cannot be discarded.",
    reviewError: "That did not go through. Try again.",
  },
  seats: {
    back: "Back to course",
    heading: "Seats",
    // Honest about the one rule that shapes this whole surface.
    note: "A code is shown once, in the files a batch produces. Download them, hand them out, and keep them somewhere safe: we cannot show a code again.",
    countLabel: "How many seats",
    generateAction: "Generate seats",
    csvLink: "Download codes (CSV)",
    pdfLink: "Download cards (PDF)",
    batchReady: (count: number) =>
      `${count} ${count === 1 ? "seat" : "seats"} added. The codes are in these files, this once.`,
    empty: "No seats yet. Generate a batch to hand out codes.",
    colSeat: "Seat",
    colStatus: "Status",
    colLastUsed: "Last used",
    colSubmissions: "Submissions",
    active: "Active",
    revoked: "Revoked",
    neverUsed: "Not yet used",
    revoke: "Revoke",
    reissue: "Reissue",
    reissued: (seat: string) => `New code for ${seat}, shown once:`,
    copy: "Copy",
    copied: "Copied",
  },
} as const;
