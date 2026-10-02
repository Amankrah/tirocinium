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
    // The card the student is holding says "Your code is your seat, for the
    // whole term", and the professor issues it per seat, not per course: one
    // code admits one student, and a second person using it takes over the
    // same seat rather than getting their own. Labelling it "Course code"
    // invited a class to share the one code they saw on a slide.
    codeLabel: "Seat code",
    codeHint: "On the card from your professor. It is yours for the term.",
    action: "Enter course",
    failure: "That code did not work. Check it against the card from your professor.",
  },
  // How practice works (guide 4.2). The guide fixes two things about this
  // copy. The handwriting line is said once and said plainly, and it is not
  // dressed up as settled neuroscience, because the audience is academic and
  // will rightly distrust a hard claim: "tends to" is the honest strength of
  // it. And the defence is framed as "talk it through", the reward for having
  // done the work, never as a second test.
  onboarding: {
    panelTitle: "New here? This is how practice works",
    panelDismiss: "Got it",
    pageLink: "How practice works",
    pageTitle: "How practice works",
    intro:
      "Four steps, and the loop closes on itself: what you cannot defend is " +
      "what you practise next.",
    steps: [
      {
        title: "Work it on paper",
        body:
          "Open a problem and solve it by hand, the way you would in an exam. " +
          "Working a problem out on paper tends to bed the concept down more " +
          "firmly than typing it does, which is why this platform is built " +
          "around paper rather than fighting it. Press start when you begin, " +
          "so the time you spent is part of your record.",
      },
      {
        title: "Photograph what you wrote",
        body:
          "Take a photo of each page with your phone. Your handwriting is " +
          "read back to you before anything else happens, so you can check it " +
          "was understood. You can also write on screen, or upload a PDF from " +
          "a tablet.",
      },
      {
        title: "Talk it through",
        body:
          "Then explain your reasoning out loud to a tutor that has read your " +
          "actual working. It is not marking you and it is not a second test: " +
          "it asks why you set the problem up the way you did. Saying it out " +
          "loud is where you find the steps you only half knew. You can type " +
          "instead if you would rather, or if you are somewhere quiet.",
      },
      {
        title: "Practise the gap",
        body:
          "The conversation ends by naming the one idea most worth returning " +
          "to, and offers you a fresh version of the problem aimed at exactly " +
          "that. Every problem has many versions, so practising again is never " +
          "re-reading an answer you have already seen.",
      },
    ],
    // Said last, because it is the thing a student most needs permission for.
    reassurance:
      "Nothing here is graded by a machine. Your professor sees your work; " +
      "the tutor is there to help you find the gaps before they do.",
  },
  course: {
    // The resolve-into-course greeting by seat number (guide 4.0).
    greeting: (seatNumber: string, courseTitle: string) =>
      `Seat ${seatNumber}, welcome to ${courseTitle}.`,
    empty: "Your case studies will appear here as your professor publishes them.",
    heading: "Problems",
    count: (count: number) => (count === 1 ? "1 problem" : `${count} problems`),
    countInTopic: (count: number, topic: string) =>
      count === 1 ? `1 problem in ${topic}` : `${count} problems in ${topic}`,
    countOf: (count: number, catalogue: number) => `${count} of ${catalogue}`,
    searchLabel: "Find a problem",
    searchPlaceholder: "Title or topic",
    searchAction: "Search",
    clearSearch: "Clear search",
    topicsLabel: "Topics",
    allTopics: "All topics",
    noTopic: "No topic",
    noMatches: "Nothing matched that. Try another topic, or a broader search.",
    also: (names: string) => `Also ${names}`,
    range: (from: number, to: number, total: number) => `${from} to ${to} of ${total}`,
    pageStatus: (page: number, pages: number) => `Page ${page} of ${pages}`,
    previous: "Previous",
    next: "Next",
    pagination: "Problem pages",
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
    // The action rail (guide 4.1, decision 0084): a fresh pooled variant, or
    // start working on the current one. Starting opens the page where the
    // solution is written or added, so that page is not also a second button.
    // It needs a variant to file against, which the pool provides once a case
    // study is parameterized and published.
    newVariant: "New variant",
    // Asking for another version when the pool has none to give (decision 0088).
    // Said plainly, because the alternative is a button that appears to do
    // nothing: the problem is unchanged and the student is owed the reason.
    onlyVariant:
      "This is the only version of this problem so far. Your professor's others are still being prepared.",
    // The "start attempt" moment (guide 4.2, decision 0058). Honest about what
    // it does and what it is for: the record is the student's own, and it is
    // what makes their effort visible rather than a stopwatch judging them.
    startAttempt: "Start working",
    attemptStarted:
      "We noted when you started. Your work will show the time you spent on it.",
    uploadNeedsVariant:
      "Uploading opens once your professor publishes a variant of this problem.",
    // The marketplace entry (Phase 10). Shown only when the course prices
    // materials, because most courses do not, and an always-present link to a
    // surface that answers "not here" would be a worse answer than silence.
    price: "Price your materials",
    // Temporary (decision 0085): opens the whole worked solution in one step,
    // so the author can check a problem while testing. Remove with that decision.
    seeSolution: "See the solution",
    seeSolutionFailed: "The solution did not open. Try again.",
  },
  // The materials marketplace (decision 0076). Prices are struck for this
  // student's own problem, which the copy says plainly in one place rather than
  // hedging everywhere: a student who thinks the figures are shared will draw
  // the wrong conclusion from them.
  marketplace: {
    title: "Materials",
    back: "Back to the problem",
    yourPrices:
      "These prices are quoted for your problem. Another student's numbers will differ, so the reasoning is what travels, not the figure.",
    offline: "We could not reach the suppliers. Try again in a moment.",
    suppliers: "Suppliers",
    supplierLines: (count: number) =>
      count === 1 ? "1 line" : `${count} lines`,
    fromPrice: (price: string) => `From ${price}`,
    shortlist: "Suggested for this problem",
    shortlistHint:
      "Your professor put these first. You can quote anything in the catalogue.",
    briefFactors: "What the choice has to survive",
    search: "Search materials",
    searchPlaceholder: "Grade, form, or SKU",
    allSuppliers: "All suppliers",
    allCategories: "All categories",
    sort: "Sort by",
    sortRelevance: "Suggested first",
    sortPriceAsc: "Price, low to high",
    sortPriceDesc: "Price, high to low",
    sortLead: "Lead time",
    sortName: "Name",
    resultCount: (count: number) =>
      count === 1 ? "1 material" : `${count} materials`,
    noResults: "Nothing matched that. Try a broader search.",
    more: "Show more",
    perUnit: (price: string, unit: string) => `${price} per ${unit}`,
    perKilo: (price: string) => `${price} per kg`,
    minimumOrder: (quantity: string, unit: string) =>
      `Minimum ${quantity} ${unit}`,
    add: "Add to quote",
    added: "In your quote",
    compare: "Compare",
    comparing: (count: number) => `Comparing ${count}`,
    compareFull: "You can compare five at a time.",
    clearComparison: "Clear",
    // The basket. Called a quote throughout, never a cart: the artifact the
    // student leaves with is a quotation, and naming it early teaches the word.
    quote: {
      heading: "Your quote",
      empty: "Nothing quoted yet. Add a material to start.",
      quantity: (unit: string) => `Quantity in ${unit}`,
      cutToLength: "Cut to length",
      cuts: "Cuts",
      remove: (name: string) => `Remove ${name}`,
      goods: "Materials",
      discount: "Volume discount",
      cutting: "Cutting",
      freight: "Freight",
      total: "Total",
      totalMass: "Mass",
      longestLead: "Ready in",
      costPerKilo: "Cost per kilogram",
      costPerKiloUnknown: "Not applicable to shop time",
      issue: "Issue this quote",
      issuing: "Issuing…",
      issued: (number: string) => `Quotation ${number}`,
      validUntil: (date: string) => `Valid until ${date}`,
      frozen:
        "This quotation is issued, so its prices are fixed. Start another to price a different route.",
      startAnother: "Start another quote",
      discard: "Discard",
      // Notices are the server's own words about what it did to the basket,
      // shown rather than swallowed: a quantity silently raised is a number the
      // student cannot account for in their defence.
      notices: "About your quote",
    },
    // The request for quotation. The answer is authored rules, not a model, and
    // the copy says so, because a student who thinks a machine wrote it will
    // weigh it wrongly in both directions.
    rfq: {
      heading: "Ask the supplier",
      hint: "Answer what a supplier would need before they could price your part.",
      component: "What are you making?",
      quantityLabel: "How many, and in what unit?",
      volume: "Production volume",
      environment: "Where will it live?",
      certification: "Certification needed",
      tolerance: "Tolerance or finish",
      notes: "Anything else",
      send: "Send request",
      sending: "Sending…",
      answer: "Their reply",
      missing: "They could not price this without:",
      authored:
        "These notes come from the catalogue's own application-engineering rules, not from a model.",
    },
  },
  // The upload flow (guide 4.1): the most engineered student surface. Copy is
  // plain and honest; the client checks catch the obvious, and the server stays
  // the authority on a page's readability, so blur is a retake prompt, not a
  // refusal.
  upload: {
    title: "Upload your solution",
    sendingTitle: "Sending your solution",
    // Once the pages are in, the worker checks they can be read, reads the
    // handwriting, then compares the working with the solution (pipeline, then
    // evidence emission). The heading names that, so the upload instructions
    // do not stay on screen as if nothing had been sent.
    markingTitle: "Marking your solution",
    // The result of that read. The outcome sentence under it says which.
    resultTitle: "Your solution",
    back: "Back to the problem",
    question: "The problem",
    intro:
      "Write your solution here, or add photos of each page. You can reorder them before you send.",
    // The three input modes (decision 0042). The file modes are the fallback
    // for anyone without a pen or touch.
    modePhotos: "Photos of paper",
    modePdf: "Handwriting PDF",
    modePen: "Write here",
    modeHint: "How would you like to submit?",
    choosePdf: "Choose a PDF",
    penHint:
      "Write with the pen, rub a mistake out, or undo it. The lines are a guide and are not part of the page. Add the page when it is done.",
    penScroll: "Handwriting space",
    penCanvas: "Handwriting page",
    penTools: "Writing tools",
    pen: "Pen",
    eraser: "Eraser",
    penWeight: "Line weight",
    penSizes: { fine: "Fine", medium: "Medium", broad: "Broad" },
    penUndo: "Undo",
    penRedo: "Redo",
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
    empty: "No pages yet. Write a page, or add a photo of your work.",
    submit: (count: number) =>
      count === 1 ? "Send 1 page" : `Send ${count} pages`,
    statusUploading: "Sending your pages…",
    statusFailed: "Some pages did not send. Retry them, then send again.",
    statusProcessing: "Sent. We are reading your pages now.",
    // The four things that actually happen after send, in order. Shown as a
    // list with the current one named, not as a single "reading" line.
    stepSent: "Pages sent",
    stepChecking: "Checking the pages can be read",
    stepReading: "Reading your handwriting",
    stepComparing: "Comparing your working with the solution",
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
    // The question the steps answer. The writing page uses the same words
    // (decision 0080): a solution without its problem is a derivation you
    // cannot check.
    question: "The problem",
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
    // Guide 4.2: a revealed step goes straight into the conversation, and only
    // once this seat has a processed submission for the variant. Said once for
    // the whole solution: repeating it under every step reads as a comment on
    // the mathematics.
    ask: "Ask the tutor about this step",
    askUnavailable: "You can ask about a step once your own working has been read.",
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
