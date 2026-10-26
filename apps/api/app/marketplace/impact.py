"""Cradle-to-gate impact, read the same way everywhere (decision 0110).

The figures live on the catalogue. What a student argues from is derived here:
a per-unit quantity a quotation can multiply, a lecture band, and the three
carbon-weighted indices. A missing input is null. A zero that was published
(a documentation-only process, a carbon-storing material, a service
temperature of 0 °C) is a measurement and stays a measurement.
"""

import math
from typing import Literal

from app.marketplace.catalogue import CatalogueLine

BandKind = Literal["ee", "co2", "h2o", "recy"]

# A teaching assumption, stated wherever the number is shown: 450 km of Québec
# road freight at 0.11 kg CO2e per tonne-kilometre. It is not part of the
# cradle-to-gate total. That total ends at the supplier's gate.
ROAD_FREIGHT_KM = 450
ROAD_FREIGHT_KG_CO2E_PER_TONNE_KM = 0.11

_BANDS: dict[BandKind, tuple[tuple[float, str], ...]] = {
    "ee": ((5, "Very low"), (15, "Low"), (40, "Moderate"), (90, "High")),
    "co2": ((0.5, "Very low"), (1.5, "Low"), (4, "Moderate"), (10, "High")),
    "h2o": ((50, "Very low"), (150, "Low"), (500, "Moderate"), (1500, "High")),
    "recy": ((10, "Very poor"), (30, "Poor"), (55, "Moderate"), (80, "Good")),
}
_ABOVE: dict[BandKind, str] = {
    "ee": "Very high",
    "co2": "Very high",
    "h2o": "Very high",
    "recy": "Excellent",
}


def impact_band(kind: BandKind, value: float | None) -> str | None:
    """The lecture band for a per-kilogram figure. Carbon below zero is its
    own band: the material stores more than its production emitted, for as
    long as that carbon stays locked in the part."""
    if value is None:
        return None
    if kind == "co2" and value < 0:
        return "Carbon negative"
    for limit, label in _BANDS[kind]:
        if value <= limit:
            return label
    return _ABOVE[kind]


def embodied_energy_per_unit(line: CatalogueLine) -> float | None:
    """Energy for one unit of sale. A process carries its own figure, because
    it has no mass. A material is its per-kilogram figure times the mass of
    the unit it is sold as."""
    if line.process_energy_mj is not None:
        return line.process_energy_mj
    energy = line.properties.embodied_energy_mj_kg
    if energy is None or line.kg_per_unit <= 0:
        return None
    return energy * line.kg_per_unit


def carbon_per_unit(line: CatalogueLine) -> float | None:
    """Carbon for one unit of sale, on the same rule as energy. Negative when
    the supplied unit stores carbon."""
    if line.process_carbon_kg is not None:
        return line.process_carbon_kg
    carbon = line.properties.carbon_kg_co2e
    if carbon is None or line.kg_per_unit <= 0:
        return None
    return carbon * line.kg_per_unit


def water_per_unit(line: CatalogueLine) -> float | None:
    """Water for one unit of sale. A process publishes none, and a missing
    figure stays missing rather than becoming zero."""
    if line.process_energy_mj is not None or line.process_carbon_kg is not None:
        return None
    water = line.properties.water_l_kg
    if water is None or line.kg_per_unit <= 0:
        return None
    return water * line.kg_per_unit


def carbon_for_strength(line: CatalogueLine) -> float | None:
    """rho * CO2 / sigma_y. Lower spends less carbon on a strength-limited tie.
    sigma_y is in MPa and rho in kg/m3, which is the catalogue's own convention."""
    rho = line.properties.density_kg_m3
    sigma = line.properties.yield_strength_mpa
    carbon = line.properties.carbon_kg_co2e
    if not rho or not sigma or carbon is None:
        return None
    return rho * carbon / sigma


def carbon_for_stiffness(line: CatalogueLine) -> float | None:
    """rho * CO2 / sqrt(E), with E in GPa: Ashby's beam-in-bending index with
    carbon in place of mass. Lower spends less carbon on a stiffness-limited
    beam. A tie limited by stiffness would use rho / E and a panel rho / E^(1/3);
    the beam is the common structural case and the one the course teaches."""
    rho = line.properties.density_kg_m3
    modulus = line.properties.youngs_modulus_gpa
    carbon = line.properties.carbon_kg_co2e
    if not rho or not modulus or carbon is None:
        return None
    return rho * carbon / math.sqrt(modulus)


def carbon_per_dollar(line: CatalogueLine, price_cents: int) -> float | None:
    """Kilograms of CO₂e per dollar of material, at the price the student is
    actually being quoted. Lower is better, and a negative value is better
    than zero."""
    carbon = line.properties.carbon_kg_co2e
    if carbon is None or line.kg_per_unit <= 0 or price_cents <= 0:
        return None
    return carbon / (price_cents / line.kg_per_unit / 100)


def freight_carbon_kg(mass_grams: int) -> float | None:
    """Road-freight carbon for a mass. Null when the basket has no mass, which
    is every basket made only of shop time."""
    if mass_grams <= 0:
        return None
    mass_kg = mass_grams / 1000
    return mass_kg * ROAD_FREIGHT_KG_CO2E_PER_TONNE_KM * ROAD_FREIGHT_KM / 1000
