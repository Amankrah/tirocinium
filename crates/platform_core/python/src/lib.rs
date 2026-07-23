//! The `platform_core` extension module: every member's Python surface,
//! one wheel, one `PyO3` boundary (backend guide section 2). Each member owns
//! its bindings behind its `python` feature and exposes a `register`
//! function; this crate only assembles submodules.

use pyo3::prelude::*;

#[pymodule]
fn platform_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    let py = m.py();
    // sys.modules registration makes `import platform_core.codec` work like
    // any package import; add_submodule alone only supports the from-form.
    let sys_modules = py.import("sys")?.getattr("modules")?;

    let mastery = PyModule::new(py, "mastery")?;
    tirocinium_mastery::python::register(&mastery)?;
    m.add_submodule(&mastery)?;
    sys_modules.set_item("platform_core.mastery", &mastery)?;

    let codec = PyModule::new(py, "codec")?;
    tirocinium_codec::python::register(&codec)?;
    m.add_submodule(&codec)?;
    sys_modules.set_item("platform_core.codec", &codec)?;

    let preprocess = PyModule::new(py, "preprocess")?;
    tirocinium_preprocess::python::register(&preprocess)?;
    m.add_submodule(&preprocess)?;
    sys_modules.set_item("platform_core.preprocess", &preprocess)?;

    Ok(())
}
