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
    intro: "Sign in to your professor account.",
    emailLabel: "Email",
    passwordLabel: "Password",
    action: "Sign in",
    failure: "Email or password is incorrect.",
    createAccount: "Create an account",
  },
  signUp: {
    title: "Create an account",
    intro:
      "This is a professor account. Students enter a course with a seat code, not by signing up.",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordHint: "At least 10 characters.",
    confirmLabel: "Confirm password",
    action: "Create account",
    signIn: "Sign in",
    enterCourse: "Enter a course",
    tooShort: "Use at least 10 characters.",
    missing: "Enter an email and both passwords.",
    mismatch: "Those passwords do not match.",
    exists: "An account with this email already exists.",
    invalid: "Check the email and password and try again.",
    unavailable: "That did not work. Check your connection and try again.",
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
    masteryLink: "Class progress",
  },
  // The professor's per-concept distribution (mastery spec 6, guide 4.2b): the
  // class's relationship to the material, aggregated with restraint. No per-seat
  // identity and no ranking exist here, by design; the counts are anonymous.
  distribution: {
    title: "Class progress",
    back: "Back to course",
    intro:
      "How the class stands on each concept. No names and no ranking, just where the class is with the material.",
    empty: "Progress will appear here as students practise.",
    labels: {
      unseen: "Unseen",
      shaky: "Shaky",
      developing: "Developing",
      solid: "Solid",
    } as Record<string, string>,
    count: (n: number, label: string) => `${n} ${label.toLowerCase()}`,
    seats: (n: number) => (n === 1 ? "1 seat" : `${n} seats`),
    gaps: "Common gaps",
    // The gaps slot is designed but empty until Phase 7's defenses name
    // misconceptions verbatim.
    gapsEmpty: "Common gaps will appear here once voice defenses begin.",
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
    queueLabel: "Detected problems queue",
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
    // Names the queue's focus stop, so arriving there by keyboard says where you
    // are (decision 0067).
    reviewQueueLabel: "Flagged variants queue",
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
    // The j/k model guide 4.4 makes a launch requirement, not a refinement.
    reviewKeys:
      "j and k move through the queue, Enter opens the comparison, a promotes, e edits.",
  },
  // Course reporting (guide 8, milestone 8.3, decision 0048). Two rules the
  // copy has to carry: a cost nobody configured a price for is not a zero, and
  // a statistic with an empty denominator is not a finding. Both say so.
  reports: {
    back: "Back to course",
    link: "Reports",
    heading: "Reports",
    // Activity, ordered by seat number and never by volume, because a report
    // sorted by who did most is the ranking the mastery spec rules out.
    activityHeading: "Activity",
    activityNote:
      "Ordered by seat number. Nothing here ranks students against each other.",
    activitySummary: (active: number, total: number) =>
      `${active} of ${total} seats have submitted something.`,
    colSeat: "Seat",
    colStatus: "Status",
    colSubmissions: "Submissions",
    colGraded: "Graded",
    colDefences: "Defences",
    colLastSubmitted: "Last submitted",
    never: "Never",
    activityEmpty: "No seats yet. Generate a batch to hand out codes.",
    // Spend.
    usageHeading: "Spend",
    usageUnpriced:
      "No prices are configured, so this shows real usage without costs. Set them to see money.",
    usageTokens: "Model calls",
    usageSpeech: "Speech",
    usageEmpty: "Nothing has been spent on this course yet.",
    colKind: "What for",
    colModel: "Model",
    colProvider: "Provider",
    colCalls: "Calls",
    colInput: "Input tokens",
    colOutput: "Output tokens",
    colAmount: "Amount",
    colCost: "Cost",
    notPriced: "Not priced",
    usageTotals: (input: number, output: number) =>
      `${input.toLocaleString("en-GB")} tokens in, ${output.toLocaleString("en-GB")} out.`,
    // The two product-health measures of guide 8.
    healthHeading: "How well the platform is reading and verifying",
    recognitionHeading: "Confidence in the handwriting it read",
    recognitionSummary: (mean: number, pages: number) =>
      `Mean ${Math.round(mean * 100)}% across ${pages.toLocaleString("en-GB")} pages.`,
    recognitionRejected: (count: number) =>
      count === 1
        ? "1 page was rejected as unreadable."
        : `${count} pages were rejected as unreadable.`,
    recognitionEmpty: "No pages have been read yet.",
    bucketLabel: (lower: number, upper: number) =>
      `${Math.round(lower * 100)} to ${Math.round(upper * 100)}%`,
    bucketCount: (count: number) => (count === 1 ? "1 page" : `${count} pages`),
    verificationHeading: "Variants that verified cleanly",
    verificationRate: (rate: number) => `${Math.round(rate * 100)}% passed`,
    verificationCounts: (verified: number, flagged: number, manual: number) =>
      `${verified} verified, ${flagged} flagged, ${manual} yours by hand.`,
    verificationNone:
      "No variants have been machine-verified yet, so there is no pass rate to report.",
    // The calibration loop of mastery spec 10.
    agreementHeading: "How the tutor's reading compares with your grades",
    agreementNote:
      "Each closed defence's rubric paired with the grade you gave that submission.",
    agreementPairs: (pairs: number) =>
      pairs === 1 ? "From 1 pair." : `From ${pairs} pairs.`,
    agreementMeanGrade: "Your mean grade",
    agreementMeanRubric: "The tutor's mean",
    agreementBias: "Difference",
    agreementBiasNote: (signed: number) =>
      signed > 0
        ? "Positive means the tutor read more generously than you did."
        : signed < 0
          ? "Negative means the tutor read more harshly than you did."
          : "The two agree on average.",
    agreementSpread: "Mean gap, either way",
    agreementCorrelation: "Correlation",
    // The one string that stands for every null: we cannot say, and will not
    // invent a number that would read like a finding.
    notEnoughData: "Not enough yet",
  },
  // Submission review (guide 4.4, milestone 8.1, decision 0059). Density is
  // welcome here, and the copy carries no judgement of the student: a seat
  // number, what was read, and how sure the reading is.
  submissions: {
    back: "Back to course",
    heading: "Submissions",
    link: "Review submissions",
    empty: "No submissions yet. They appear here as students send their work.",
    keys: "j and k move through the queue, Enter opens one.",
    queueLabel: "Submissions queue",
    filterAll: "All",
    filterProcessed: "Read",
    filterNeedsRetake: "Needs a retake",
    filterProcessing: "Still reading",
    seat: (seatNumber: string) => `Seat ${seatNumber}`,
    pages: (count: number) => (count === 1 ? "1 page" : `${count} pages`),
    confidence: (percent: number) => `${percent}% sure of the reading`,
    noConfidence: "Not read yet",
    graded: (score: number) => `Graded ${Math.round(score * 100)}%`,
    ungraded: "Not graded",
    open: "Open",
    loadMore: "Load more",
    // The engaged span (decision 0058), shown where the guide wants effort
    // legible. Absent rather than zero when nobody recorded a start.
    engaged: (minutes: number) =>
      minutes < 1 ? "under a minute" : `${minutes} min`,
    noEngaged: "No start recorded",
    // The detail: the scan beside the transcription.
    detailHeading: (seatNumber: string) => `Seat ${seatNumber}`,
    backToQueue: "Back to submissions",
    notRead: "This submission has not been read yet, so there is nothing to check.",
    pageLabel: (index: number) => `Page ${index}`,
    // Which image is which, said plainly, because the boxes only line up on one
    // of them (decision 0059).
    showRendition: "What the model read",
    showOriginal: "Original photo",
    renditionNote:
      "Boxes are drawn on the page the model read, which is straightened and cleaned. The original photo is the other view.",
    reload: "Reload this page image",
    imageFailed: "That image link expired. Reload it.",
    reading: "The reading",
    noReading: "Nothing was read from this page.",
    rejected: (reason: string) => `This page was rejected: ${reason}`,
    lowConfidence: "Less certain here",
    lowConfidenceNote:
      "Highlighted lines are where the reading is least certain. Hover or focus one to find it on the page.",
    regionLabel: (percent: number) => `${percent}% sure`,
    // Grading. The score is evidence, so the copy says what it does.
    gradeHeading: "Grade",
    gradeNote:
      "A grade you give outweighs what the platform inferred, on every concept this case study covers.",
    gradeLabel: "Score out of 100",
    gradeAction: "Save grade",
    gradeSaved: (score: number) => `Saved ${Math.round(score * 100)}%.`,
    gradeFailed: "That grade did not save. Try again.",
    gradeRange: "A grade is between 0 and 100.",
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
