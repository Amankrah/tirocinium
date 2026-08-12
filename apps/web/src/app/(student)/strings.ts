// Student route group strings (guide 3.4: sentence case, one job per string,
// errors state what happened and what to do next). The failure line is the
// generic copy of guide 4.0: it never distinguishes wrong, revoked, or
// malformed, because the backend will not tell us and the copy should not
// pretend to know.
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    // The seat number kept quietly present so a student always knows which
    // identity their work is filed under (guide 4.0). Never a name.
    seat: (seatNumber: string) => `Seat ${seatNumber}`,
  },
  enter: {
    title: "Enter your course",
    codeLabel: "Course code",
    action: "Enter course",
    failure: "That code did not work. Check it against the card from your professor.",
  },
  course: {
    // The resolve-into-course greeting by seat number (guide 4.0).
    greeting: (seatNumber: string, courseTitle: string) =>
      `Seat ${seatNumber}, welcome to ${courseTitle}.`,
    empty: "Your case studies will appear here as your professor publishes them.",
    notAttempted: "Not attempted yet",
  },
  // The mastery picture (mastery spec 4.5 and 9). A label is never shown bare:
  // it always resolves, on tap, to the plain-language evidence trail the model
  // returned. Labels are calm, no ranking, no colour hierarchy; unseen concepts
  // are quiet, not an error.
  mastery: {
    heading: "Your progress",
    empty: "Your progress will grow here as you practise.",
    notStarted: "Not started",
    labels: {
      shaky: "Shaky",
      developing: "Developing",
      solid: "Solid",
    } as Record<string, string>,
    // The disclosure names the evidence, honouring the transparency contract.
    evidence: "See the evidence",
    dueForRevisit: "Worth a fresh look",
  },
  // The revisit queue (mastery spec 6). Calm, one targeted variant per concept,
  // never a nag; an empty queue is the normal state and simply not shown.
  revisit: {
    heading: (count: number) =>
      count === 1
        ? "One concept is worth a fresh look"
        : `${count} concepts are worth a fresh look`,
    practise: "Practise",
    noVariant: "Nothing to practise right now.",
  },
  problem: {
    backToCourse: "Back to course",
    concepts: "Concepts",
    // The action rail (guide 4.1): a fresh pooled variant, or upload a solution
    // for the current one. Upload needs a variant to file against, which the
    // pool provides once a case study is parameterized and published.
    newVariant: "New variant",
    // The "start attempt" moment (guide 4.2, decision 0058). Honest about what
    // it does and what it is for: the record is the student's own, and it is
    // what makes their effort visible rather than a stopwatch judging them.
    startAttempt: "Start working",
    attemptStarted:
      "We noted when you started. Your work will show the time you spent on it.",
    upload: "Upload solution",
    uploadNeedsVariant:
      "Uploading opens once your professor publishes a variant of this problem.",
  },
  // The upload flow (guide 4.1): the most engineered student surface. Copy is
  // plain and honest; the client checks catch the obvious, and the server stays
  // the authority on a page's readability, so blur is a retake prompt, not a
  // refusal.
  upload: {
    title: "Upload your solution",
    back: "Back to the problem",
    intro:
      "Add clear photos of each handwritten page. You can reorder them before you send.",
    // The three input modes (decision 0042). The file modes are the fallback
    // for anyone without a pen or touch.
    modePhotos: "Photos of paper",
    modePdf: "Handwriting PDF",
    modePen: "Write here",
    modeHint: "How would you like to submit?",
    choosePdf: "Choose a PDF",
    penHint: "Write your solution with a pen, stylus, or finger. Add each page when it is done.",
    penCanvas: "Handwriting page",
    penAdd: "Add this page",
    penClear: "Clear",
    dropPrompt: "Drag your pages here, or",
    choose: "Choose photos",
    capture: "Take a photo",
    // Rejections that never reach the page list, one honest line each.
    rejectedType: (name: string) =>
      `${name} is not a photo or PDF, so it was left out.`,
    rejectedTooLarge: (name: string) => `${name} is over 15 MB, so it was left out.`,
    rejectedEmpty: (name: string) => `${name} is empty, so it was left out.`,
    // A soft warning on a page that stays in the list.
    blurry: "This page looks blurry. Retake it, or send it and we will try.",
    pageLabel: (index: number) => `Page ${index}`,
    remove: (index: number) => `Remove page ${index}`,
    moveUp: (index: number) => `Move page ${index} up`,
    moveDown: (index: number) => `Move page ${index} down`,
    retry: (index: number) => `Retry page ${index}`,
    empty: "No pages yet. Add photos of your handwritten work.",
    submit: (count: number) =>
      count === 1 ? "Send 1 page" : `Send ${count} pages`,
    statusUploading: "Sending your pages…",
    statusFailed: "Some pages did not send. Retry them, then send again.",
    statusProcessing: "Sent. We are reading your pages now.",
    statusError: "That did not go through. Check your connection and try again.",
    // The processing stream (guide 4.1, step 4): per-page progress, then the
    // outcome. A rejected page's message is worded to read after "Page N".
    reading: "Reading your pages…",
    pageRead: (index: number) => `Page ${index} read`,
    pageHardToRead: (index: number) => `Page ${index} was hard to read`,
    pageRetake: (index: number, message: string) => `Page ${index} ${message}`,
    processed: "We have read all your pages.",
    checkSpans: "Check the highlighted lines match what you wrote.",
    needsRetake:
      "Some pages need a clearer photo. Retake the ones flagged above, then send again.",
    processFailed:
      "Something went wrong while reading your pages. Please try sending them again.",
    streamLost: "The live update stopped. Refresh the page to see the result.",
    startOver: "Start a new upload",
    // The defence is the reward for having done the work, never a gate on it
    // (guide 4.2), so it is an invitation beside the reading, not a next step.
    defend: "Talk it through",
  },
  // The understanding unfold (guide 4.2, milestone 8.4, decision 0049). Reading
  // the solution is itself an act of engagement, so it arrives a step at a time
  // rather than as a wall of text. The copy never scolds: giving up is a
  // legitimate choice, stated plainly and without a penalty attached.
  unfold: {
    title: "The worked solution",
    back: "Back to the problem",
    // Shown when the seat has neither submitted nor given up. Both ways in are
    // named, because the 403 is a state, not a failure.
    notEarned:
      "The solution opens once you have sent your own attempt. If you would rather stop here, you can read it now instead.",
    submitInstead: "Upload your solution",
    giveUp: "Read it without attempting",
    gaveUp: "You opened this without attempting. Nothing about that is held against you.",
    progress: (revealed: number, total: number) =>
      `${revealed} of ${total} steps`,
    stepLabel: (n: number) => `Step ${n}`,
    next: "Show the next step",
    complete: "That is the whole solution.",
    // Guide 4.2: a revealed step goes straight into the conversation.
    ask: "Ask the tutor about this step",
    askUnavailable: "Talking about a step needs a submission the tutor can read.",
    failed: "That did not open. Try again.",
    unavailable: "This solution is not available.",
  },
  // The seat's own record (guide 4.2b, milestone 8.4). Effort made legible, to
  // the person who did it. No streaks, no ranking, no comparison to anyone.
  history: {
    title: "Your work",
    heading: "Your work",
    link: "Your work",
    empty: "Your attempts will be listed here once you send your first one.",
    submitted: (date: string) => `Sent ${date}`,
    graded: (score: number) => `Graded ${Math.round(score * 100)}%`,
    ungraded: "Not graded",
    defended: "Defended out loud",
    // The (started, submitted) span (guide 4.2, decision 0058). Rounded to
    // minutes, because a second-precise figure would invite reading it as a
    // score; a submission with no recorded start simply says nothing.
    engaged: (minutes: number) =>
      minutes < 1 ? "Under a minute of work" : `${minutes} min of work`,
    unfolded: "Solution read",
    readSolution: "Read the solution",
    talkItThrough: "Talk it through",
    more: "Show earlier work",
  },
  // The voice defence (guide 4.2, milestone 7.4). The tutor is warm and never
  // punitive, the copy never dresses the conversation up as a test, and the two
  // degraded states say plainly what happened and what to do instead.
  defence: {
    title: "Talk it through",
    back: "Back to your solution",
    intro:
      "Explain your reasoning out loud. The tutor has read what you wrote and will ask you about it. It never gives you the answer.",
    // Said once, plainly, because it is true and worth knowing (decision 0043).
    privacy: "Your voice is not kept. The written conversation is.",
    yourWork: "What you wrote",
    start: "Start talking",
    startTyped: "Type instead",
    opening: "Opening the conversation…",
    // The submission has to be read before there is anything to defend.
    notReady:
      "We are still reading your pages. The conversation opens once that is done.",
    busy: "Your course has as many conversations running as it can hold. Try again in a few minutes.",
    unavailable:
      "The conversation could not open. Go back to your solution and try again.",
    connecting: "Connecting…",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    you: "You",
    tutor: "Tutor",
    // A reply the student spoke over. It stays in the conversation, because it
    // was said.
    interrupted: "You spoke here.",
    // Recognition is gone, by refusal or by failure; the keyboard takes over and
    // the conversation carries on.
    speechDown: "We cannot hear you. Type your answers instead and carry on.",
    audioDown: "The tutor's voice stopped. Its words carry on below.",
    windDown: "The tutor is wrapping this up.",
    answerLabel: "Your answer",
    send: "Send",
    end: "End the conversation",
    ended: "The conversation is over.",
    lost: "The connection dropped. What you said is saved up to that point.",
    // The loop closes: name the one concept worth revisiting and offer a fresh
    // variant that targets it (guide 4.2).
    revisitHeading: "Worth revisiting",
    revisitPractise: "Practise it",
    revisitNone: "Nothing stood out as needing another look.",
  },
} as const;
