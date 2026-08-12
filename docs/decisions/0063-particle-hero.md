# 0063: The particle hero on raw WebGL2, with the shape computed once in TypeScript

Date: 2026-08-12. Milestone 9.5 (web). Author: frontend engineer (Claude).

Guide 2 offers raw WebGL2 or `ogl` for the field, and this is raw WebGL2 with no
library at all. The whole effect is one point-cloud draw call: there is no scene
graph to want, `ogl`'s 4 kB would buy an abstraction over roughly forty lines of
context setup, and guide 7 asks any new dependency to justify its bundle cost
against a budget the hero has to fit inside. The compiled module is about 3 kB
gzipped in its own chunk, which is what a library alone would have cost.

Two choices depart slightly from the guide's wording and are recorded because of
it. Guide 3.3 describes positions "derived from time, seed, and a target-shape
texture"; here the target is a `vec2` attribute rather than a texture, computed
once in `shape.ts` and uploaded as a static buffer. That is the same idea with
one asset fewer and one indirection fewer, and it buys something the texture
route could not: the SVG still and the GPU's target come from the same function,
so the resolved state a student sees under reduced motion is provably the shape
the field resolves into rather than a second drawing that can drift from it. The
shape itself is a normal distribution, which satisfies all three of the guide's
suggestions at once (a curve, a distribution, the suggestion of a solved
problem). Second, both the shape and the per-particle seeds are deterministic
rather than random: a hero that reshuffles on every refresh is noise rather than
character, and an unseeded one cannot be regression-tested.

The five non-negotiable rules map onto the code as follows. Content never waits:
the hero's text is server-rendered and the entire field sits behind
`next/dynamic` with `ssr: false`, and Lighthouse confirms the landing page's LCP
element is the wordmark, not the canvas, with LCP unchanged from the pre-hero
baseline. All simulation is in the vertex shader: after init, a frame sets two
uniforms and issues one `drawArrays`, and no JavaScript loop touches a particle
again. Capability and budget: the count is capped by device pixel ratio and
viewport, and every way the field cannot run (no WebGL2, a failed compile, a
failed link) returns null, which the component answers with the still. Reduced
motion never reaches the renderer at all, because the component checks it before
creating a context. Pausing is an `IntersectionObserver` plus a
`visibilitychange` listener, and a paused field stops requesting frames rather
than running an idle loop; elapsed time accumulates only while running, so
resuming continues rather than jumping.

One part of the gate is not verified and is stated rather than implied: the 3 ms
GPU frame-time budget on a 2019 mid-range laptop. It cannot be measured from
this environment, which renders headless in software, and a number produced here
would be about the software rasterizer rather than about the product. What is
verified is everything the budget is a proxy for: the per-frame CPU cost is one
draw call, the particle count is capped, blending is the only state change, and
the page's total blocking time with the field live is 4 to 26 ms against a
200 ms budget. The frame-time measurement itself belongs with the manual
accessibility passes as a human sign-off on real hardware, and the shader has an
owner from here on (guide 7), which means this file is not edited casually.
