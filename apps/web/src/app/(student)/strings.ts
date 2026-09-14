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
    upload: "Upload solution",
    uploadNeedsVariant:
      "Uploading opens once your professor publishes a variant of this problem.",
    // The marketplace entry (Phase 10). Shown only when the course prices
    // materials, because most courses do not, and an always-present link to a
    // surface that answers "not here" would be a worse answer than silence.
    price: "Price your materials",
  },
  // The materials marketplace (decision 0062). Prices are struck for this
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
  },
} as const;
