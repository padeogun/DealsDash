/* Derived geometry from property inputs. Rule-of-thumb — entering frontage tightens it. */
export function geom(p) {
  const area = +p.area || 0, storeys = +p.storeys || 2;
  const footprint = area / storeys;
  const frontage = +p.frontage || Math.sqrt(footprint / 1.6);
  const depth = frontage ? footprint / frontage : 0;
  const exposed = { terraced: 2 * frontage, endTerrace: 2 * frontage + depth, semi: 2 * frontage + depth, detached: 2 * (frontage + depth), flat: frontage }[p.type] || 2 * frontage;
  return {
    area, footprint, frontage, depth,
    roofArea: footprint * 1.2,
    extWallArea: exposed * storeys * 2.6,
    plasterArea: area * 2.6,
    ceilingArea: area,
    dpcLength: exposed,
    skips: Math.max(1, Math.ceil(area / 40)),
  };
}
