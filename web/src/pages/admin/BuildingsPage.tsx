import { useState, type FormEvent } from "react";
import {
  Badge,
  Card,
  Empty,
  ErrorView,
  Field,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  Stat,
  useAsync,
  useToast,
} from "../../components/ui";
import { ApiError, del, get, post, put, type Page } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { statusColor } from "../../lib/format";

interface ApartmentLite {
  id: string;
  flatNumber: string;
  floorId: string;
  blockId: string;
  bedroomCount?: number | null;
  area?: string | null;
  status: string;
}

interface FloorRow {
  id: string;
  number: number;
  label?: string | null;
  blockId: string;
  apartments: ApartmentLite[];
}

interface BlockRow {
  id: string;
  name: string;
  code: string;
  buildingId: string;
  floors: FloorRow[];
  apartments: ApartmentLite[];
}

interface BuildingRow {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  status: string;
  blocks: BlockRow[];
}

interface ApartmentDetail {
  id: string;
  flatNumber: string;
  blockId: string;
  floorId: string;
  bedroomCount?: number | null;
  area?: string | null;
  status: string;
  block: { id: string; name: string; building: { id: string; name: string } };
  floor: { number: number };
  residents: Array<{ id: string; user: { id: string; name: string; email: string; status: string } }>;
}

interface BuildingDraft {
  id?: string;
  name: string;
  code: string;
  address: string;
}

interface BlockDraft {
  id?: string;
  buildingId: string;
  name: string;
  code: string;
}

interface FloorDraft {
  blockId: string;
  number: string;
  label: string;
}

interface ApartmentDraft {
  id?: string;
  buildingId: string;
  blockId: string;
  floorId: string;
  flatNumber: string;
  bedroomCount: string;
  area: string;
}

interface ConfirmDraft {
  kind: "building" | "block" | "floor" | "apartment";
  id: string;
  label: string;
}

const LIST_LIMIT = 200;
const PAGE_SIZE = 12;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

function isConflict(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 409 || err.code.includes("FOREIGN"));
}

export default function BuildingsPage() {
  const { has } = useAuth();
  const toast = useToast();
  const canWrite = has("buildings:write");

  const [selected, setSelected] = useState<string | null>(null);
  const [aptPage, setAptPage] = useState(1);

  const {
    data: buildingsData,
    error: buildingsError,
    loading: buildingsLoading,
    reload: reloadBuildings,
  } = useAsync<Page<BuildingRow>>(() => get(`/api/buildings?page=1&limit=${LIST_LIMIT}`), []);

  const { data: statsData, reload: reloadStats } = useAsync<Page<ApartmentDetail>>(
    () => get(`/api/apartments?limit=${LIST_LIMIT}`),
    [],
  );

  const {
    data: apartmentsData,
    error: apartmentsError,
    loading: apartmentsLoading,
    reload: reloadApartments,
  } = useAsync<Page<ApartmentDetail>>(
    () => get(`/api/apartments?page=${aptPage}&limit=${PAGE_SIZE}${selected ? `&buildingId=${selected}` : ""}`),
    [aptPage, selected],
  );

  const buildings = buildingsData?.items ?? [];
  const selectedBuilding = buildings.find((b) => b.id === selected) ?? null;

  const blockCount = buildings.reduce((sum, b) => sum + b.blocks.length, 0);
  const apartmentCount = buildings.reduce(
    (sum, b) => sum + b.blocks.reduce((s, blk) => s + blk.apartments.length, 0),
    0,
  );
  const allApartments = statsData?.items ?? [];
  const occupied = allApartments.filter((a) => a.residents.length > 0).length;
  const occupancy = allApartments.length > 0 ? Math.round((occupied / allApartments.length) * 100) : 0;

  const [buildingDraft, setBuildingDraft] = useState<BuildingDraft | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);
  const [floorDraft, setFloorDraft] = useState<FloorDraft | null>(null);
  const [apartmentDraft, setApartmentDraft] = useState<ApartmentDraft | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft | null>(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refreshAll = () => {
    reloadBuildings();
    reloadApartments();
    reloadStats();
  };

  const findBlock = (blockId: string): BlockRow | null => {
    for (const b of buildings) {
      const blk = b.blocks.find((x) => x.id === blockId);
      if (blk) return blk;
    }
    return null;
  };

  const saveBuilding = async (e: FormEvent) => {
    e.preventDefault();
    if (!buildingDraft) return;
    setFormError(null);
    setBusy(true);
    try {
      const body = {
        name: buildingDraft.name.trim(),
        code: buildingDraft.code.trim(),
        address: buildingDraft.address.trim(),
      };
      if (buildingDraft.id) {
        await put(`/api/buildings/${buildingDraft.id}`, body);
        toast.push("Building updated", "success");
      } else {
        await post("/api/buildings", body);
        toast.push("Building created", "success");
      }
      setBuildingDraft(null);
      refreshAll();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), isConflict(err) ? "warn" : "error");
    } finally {
      setBusy(false);
    }
  };

  const saveBlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!blockDraft) return;
    setFormError(null);
    setBusy(true);
    try {
      const body = { name: blockDraft.name.trim(), code: blockDraft.code.trim() };
      if (blockDraft.id) {
        await put(`/api/blocks/${blockDraft.id}`, body);
        toast.push("Block updated", "success");
      } else {
        await post("/api/blocks", { ...body, buildingId: blockDraft.buildingId });
        toast.push("Block created", "success");
      }
      setBlockDraft(null);
      refreshAll();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), isConflict(err) ? "warn" : "error");
    } finally {
      setBusy(false);
    }
  };

  const saveFloor = async (e: FormEvent) => {
    e.preventDefault();
    if (!floorDraft) return;
    setFormError(null);
    const number = Number(floorDraft.number);
    if (!Number.isInteger(number) || number < -5 || number > 200) {
      setFormError("Floor number must be a whole number between -5 and 200");
      return;
    }
    setBusy(true);
    try {
      await post("/api/floors", {
        number,
        blockId: floorDraft.blockId,
        label: floorDraft.label.trim() || undefined,
      });
      toast.push("Floor added", "success");
      setFloorDraft(null);
      refreshAll();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), isConflict(err) ? "warn" : "error");
    } finally {
      setBusy(false);
    }
  };

  const saveApartment = async (e: FormEvent) => {
    e.preventDefault();
    if (!apartmentDraft) return;
    setFormError(null);
    if (!apartmentDraft.floorId) {
      setFormError("Select a floor for this flat");
      return;
    }
    if (!apartmentDraft.blockId) {
      setFormError("Select a block for this flat");
      return;
    }
    setBusy(true);
    try {
      const body = {
        flatNumber: apartmentDraft.flatNumber.trim(),
        blockId: apartmentDraft.blockId,
        floorId: apartmentDraft.floorId,
        bedroomCount: apartmentDraft.bedroomCount ? Number(apartmentDraft.bedroomCount) : undefined,
        area: apartmentDraft.area.trim() || undefined,
      };
      if (apartmentDraft.id) {
        await put(`/api/apartments/${apartmentDraft.id}`, body);
        toast.push("Apartment updated", "success");
      } else {
        await post("/api/apartments", body);
        toast.push("Apartment created", "success");
      }
      setApartmentDraft(null);
      refreshAll();
    } catch (err) {
      setFormError(errText(err));
      toast.push(errText(err), isConflict(err) ? "warn" : "error");
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!confirmDraft) return;
    setBusy(true);
    try {
      const paths = {
        building: `/api/buildings/${confirmDraft.id}`,
        block: `/api/blocks/${confirmDraft.id}`,
        floor: `/api/floors/${confirmDraft.id}`,
        apartment: `/api/apartments/${confirmDraft.id}`,
      } as const;
      await del(paths[confirmDraft.kind]);
      toast.push(`${confirmDraft.label} removed`, "success");
      setConfirmDraft(null);
      refreshAll();
    } catch (err) {
      const message = errText(err);
      toast.push(isConflict(err) ? `Cannot remove — ${message}` : message, isConflict(err) ? "warn" : "error");
      setConfirmDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const openApartmentCreate = (buildingId: string, blockId: string, floorId: string) => {
    setApartmentDraft({
      buildingId,
      blockId,
      floorId,
      flatNumber: "",
      bedroomCount: "",
      area: "",
    });
    setFormError(null);
  };

  const floorOptions = (blockId: string): FloorRow[] => findBlock(blockId)?.floors ?? [];
  const blockOptions = (buildingId: string): BlockRow[] =>
    buildings.find((b) => b.id === buildingId)?.blocks ?? [];

  const selectBuilding = (id: string) => {
    setSelected((prev) => (prev === id ? null : id));
    setAptPage(1);
  };

  const apartmentRows = apartmentsData?.items ?? [];

  return (
    <>
      <PageHeader
        title="Buildings & apartments"
        subtitle="Blocks, floors and flats across the property"
        actions={
          canWrite ? (
            <button
              className="btn primary"
              onClick={() => {
                setBuildingDraft({ name: "", code: "", address: "" });
                setFormError(null);
              }}
            >
              ＋ Add building
            </button>
          ) : undefined
        }
      />

      <div className="grid cols-4 mb">
        <Stat label="Buildings" value={buildings.length} />
        <Stat label="Blocks" value={blockCount} />
        <Stat label="Apartments" value={apartmentCount} />
        <Stat label="Occupied" value={`${occupied}/${allApartments.length}`} hint={`${occupancy}% occupancy`} />
      </div>

      {buildingsLoading ? (
        <LoadingRow label="Loading buildings…" />
      ) : buildingsError ? (
        <ErrorView error={buildingsError} onRetry={reloadBuildings} />
      ) : buildings.length === 0 ? (
        <Empty title="No buildings yet" hint="Create the first building to start mapping the property." />
      ) : (
        <Card title="Buildings">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Address</th>
                  <th>Blocks</th>
                  <th>Flats</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => {
                  const flats = b.blocks.reduce((s, blk) => s + blk.apartments.length, 0);
                  const isSelected = selected === b.id;
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                        <div className="small dim mono">{b.code}</div>
                      </td>
                      <td>{b.address || <span className="dim">—</span>}</td>
                      <td>{b.blocks.length}</td>
                      <td>{flats}</td>
                      <td>
                        <Badge tone={statusColor(b.status)}>{b.status}</Badge>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          <button className={`btn sm ${isSelected ? "primary" : ""}`} onClick={() => selectBuilding(b.id)}>
                            {isSelected ? "Hide details" : "Details"}
                          </button>
                          {canWrite && (
                            <button
                              className="btn sm"
                              onClick={() => {
                                setBuildingDraft({
                                  id: b.id,
                                  name: b.name,
                                  code: b.code,
                                  address: b.address ?? "",
                                });
                                setFormError(null);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canWrite && (
                            <button
                              className="btn sm danger"
                              onClick={() =>
                                setConfirmDraft({ kind: "building", id: b.id, label: `building ${b.name}` })
                              }
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedBuilding && (
        <Card
          title={`Blocks · ${selectedBuilding.name}`}
          actions={
            canWrite ? (
              <button
                className="btn sm"
                onClick={() => {
                  setBlockDraft({ buildingId: selectedBuilding.id, name: "", code: "" });
                  setFormError(null);
                }}
              >
                ＋ Add block
              </button>
            ) : undefined
          }
        >
          {selectedBuilding.blocks.length === 0 ? (
            <Empty title="No blocks in this building" hint="Add a block or tower to organise floors and flats." />
          ) : (
            <div className="col">
              {selectedBuilding.blocks.map((blk) => (
                <div key={blk.id} className="card" style={{ padding: 12 }}>
                  <div className="row between wrap">
                    <div className="row gap-sm">
                      <strong>{blk.name}</strong>
                      <Badge tone="blue">{blk.code}</Badge>
                      <span className="small dim">
                        {blk.floors.length} floors · {blk.apartments.length} flats
                      </span>
                    </div>
                    <div className="row gap-sm">
                      {canWrite && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setFloorDraft({ blockId: blk.id, number: "", label: "" });
                            setFormError(null);
                          }}
                        >
                          ＋ Floor
                        </button>
                      )}
                      {canWrite && (
                        <button
                          className="btn sm"
                          disabled={blk.floors.length === 0}
                          title={blk.floors.length === 0 ? "Add a floor first" : undefined}
                          onClick={() =>
                            openApartmentCreate(selectedBuilding.id, blk.id, blk.floors[0]?.id ?? "")
                          }
                        >
                          ＋ Flat
                        </button>
                      )}
                      {canWrite && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setBlockDraft({ id: blk.id, buildingId: blk.buildingId, name: blk.name, code: blk.code });
                            setFormError(null);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canWrite && (
                        <button
                          className="btn sm danger"
                          onClick={() => setConfirmDraft({ kind: "block", id: blk.id, label: `block ${blk.name}` })}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {blk.floors.length > 0 && (
                    <div className="table-wrap mt">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Floor</th>
                            <th>Flats</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {blk.floors.map((fl) => (
                            <tr key={fl.id}>
                              <td>
                                Level {fl.number}
                                {fl.label ? <span className="small dim"> · {fl.label}</span> : null}
                              </td>
                              <td>{fl.apartments.map((a) => a.flatNumber).join(", ") || <span className="dim">—</span>}</td>
                              <td>
                                <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                                  {canWrite && (
                                    <button
                                      className="btn sm"
                                      onClick={() => openApartmentCreate(selectedBuilding.id, blk.id, fl.id)}
                                    >
                                      ＋ Flat
                                    </button>
                                  )}
                                  {canWrite && (
                                    <button
                                      className="btn sm danger"
                                      onClick={() =>
                                        setConfirmDraft({
                                          kind: "floor",
                                          id: fl.id,
                                          label: `floor ${fl.number} of ${blk.name}`,
                                        })
                                      }
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card
        title="Apartments"
        actions={
          <div className="row gap-sm">
            {selectedBuilding && (
              <>
                <Badge tone="blue">Filtered: {selectedBuilding.name}</Badge>
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    setSelected(null);
                    setAptPage(1);
                  }}
                >
                  Show all
                </button>
              </>
            )}
            {canWrite && buildings.length > 0 && (
              <button
                className="btn sm"
                onClick={() => {
                  const first = buildings[0];
                  const block = first?.blocks[0];
                  setApartmentDraft({
                    buildingId: first?.id ?? "",
                    blockId: block?.id ?? "",
                    floorId: block?.floors[0]?.id ?? "",
                    flatNumber: "",
                    bedroomCount: "",
                    area: "",
                  });
                  setFormError(null);
                }}
              >
                ＋ Add flat
              </button>
            )}
          </div>
        }
      >
        {apartmentsLoading ? (
          <LoadingRow label="Loading apartments…" />
        ) : apartmentsError ? (
          <ErrorView error={apartmentsError} onRetry={reloadApartments} />
        ) : apartmentRows.length === 0 ? (
          <Empty title="No apartments found" hint="Add a block and floor first, then register flats." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Flat</th>
                    <th>Block</th>
                    <th>Building</th>
                    <th>Floor</th>
                    <th>Residents</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {apartmentRows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong className="mono">{a.flatNumber}</strong>
                        <div className="small dim">
                          {a.bedroomCount != null ? `${a.bedroomCount} bed` : ""}
                          {a.area ? ` · ${a.area}` : ""}
                        </div>
                      </td>
                      <td>{a.block.name}</td>
                      <td>{a.block.building.name}</td>
                      <td>Level {a.floor.number}</td>
                      <td>
                        {a.residents.length > 0 ? (
                          <span className="small">{a.residents.map((r) => r.user.name).join(", ")}</span>
                        ) : (
                          <span className="dim">Vacant</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={statusColor(a.status)}>{a.status}</Badge>
                      </td>
                      <td>
                        <div className="row gap-sm" style={{ justifyContent: "flex-end" }}>
                          {canWrite && (
                            <button
                              className="btn sm"
                              onClick={() => {
                                setApartmentDraft({
                                  id: a.id,
                                  buildingId: a.block.building.id,
                                  blockId: a.blockId,
                                  floorId: a.floorId,
                                  flatNumber: a.flatNumber,
                                  bedroomCount: a.bedroomCount != null ? String(a.bedroomCount) : "",
                                  area: a.area ?? "",
                                });
                                setFormError(null);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canWrite && (
                            <button
                              className="btn sm danger"
                              onClick={() =>
                                setConfirmDraft({ kind: "apartment", id: a.id, label: `flat ${a.flatNumber}` })
                              }
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {apartmentsData && (
              <Pagination
                page={apartmentsData.page}
                total={apartmentsData.total}
                limit={PAGE_SIZE}
                onChange={setAptPage}
              />
            )}
          </>
        )}
      </Card>

      <Modal
        open={buildingDraft !== null}
        title={buildingDraft?.id ? "Edit building" : "New building"}
        onClose={() => setBuildingDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setBuildingDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="building-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : buildingDraft?.id ? "Save changes" : "Create building"}
            </button>
          </>
        }
      >
        <form id="building-form" onSubmit={saveBuilding}>
          <Field label="Name *">
            <input
              className="input"
              value={buildingDraft?.name ?? ""}
              onChange={(e) => setBuildingDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              required
              minLength={2}
              maxLength={120}
            />
          </Field>
          <Field label="Code *" hint="Short unique code, stored uppercase.">
            <input
              className="input mono"
              value={buildingDraft?.code ?? ""}
              onChange={(e) => setBuildingDraft((d) => (d ? { ...d, code: e.target.value } : d))}
              required
              maxLength={40}
            />
          </Field>
          <Field label="Address">
            <input
              className="input"
              value={buildingDraft?.address ?? ""}
              onChange={(e) => setBuildingDraft((d) => (d ? { ...d, address: e.target.value } : d))}
              maxLength={300}
            />
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={blockDraft !== null}
        title={blockDraft?.id ? "Edit block" : "New block"}
        onClose={() => setBlockDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setBlockDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="block-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : blockDraft?.id ? "Save changes" : "Create block"}
            </button>
          </>
        }
      >
        <form id="block-form" onSubmit={saveBlock}>
          <Field label="Block name *">
            <input
              className="input"
              value={blockDraft?.name ?? ""}
              onChange={(e) => setBlockDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              required
              minLength={1}
              maxLength={80}
            />
          </Field>
          <Field label="Code *" hint="Unique within the building, stored uppercase.">
            <input
              className="input mono"
              value={blockDraft?.code ?? ""}
              onChange={(e) => setBlockDraft((d) => (d ? { ...d, code: e.target.value } : d))}
              required
              maxLength={40}
            />
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={floorDraft !== null}
        title="Add floor"
        onClose={() => setFloorDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setFloorDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="floor-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create floor"}
            </button>
          </>
        }
      >
        <form id="floor-form" onSubmit={saveFloor}>
          <Field label="Floor number *" hint="Whole number from -5 to 200.">
            <input
              className="input"
              type="number"
              min={-5}
              max={200}
              value={floorDraft?.number ?? ""}
              onChange={(e) => setFloorDraft((d) => (d ? { ...d, number: e.target.value } : d))}
              required
            />
          </Field>
          <Field label="Label">
            <input
              className="input"
              value={floorDraft?.label ?? ""}
              onChange={(e) => setFloorDraft((d) => (d ? { ...d, label: e.target.value } : d))}
              placeholder="Ground, First, Terrace…"
              maxLength={60}
            />
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={apartmentDraft !== null}
        title={apartmentDraft?.id ? "Edit apartment" : "New apartment"}
        onClose={() => setApartmentDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setApartmentDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn primary" form="apartment-form" type="submit" disabled={busy}>
              {busy ? "Saving…" : apartmentDraft?.id ? "Save changes" : "Create apartment"}
            </button>
          </>
        }
      >
        <form id="apartment-form" onSubmit={saveApartment}>
          <Field label="Building *">
            <select
              className="select"
              value={apartmentDraft?.buildingId ?? ""}
              onChange={(e) => {
                const buildingId = e.target.value;
                const firstBlock = blockOptions(buildingId)[0];
                setApartmentDraft((d) =>
                  d
                    ? {
                        ...d,
                        buildingId,
                        blockId: firstBlock?.id ?? "",
                        floorId: firstBlock?.floors[0]?.id ?? "",
                      }
                    : d,
                );
              }}
            >
              <option value="">Select building…</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Block *">
            <select
              className="select"
              value={apartmentDraft?.blockId ?? ""}
              onChange={(e) => {
                const blockId = e.target.value;
                const floor = floorOptions(blockId)[0];
                setApartmentDraft((d) => (d ? { ...d, blockId, floorId: floor?.id ?? "" } : d));
              }}
            >
              <option value="">Select block…</option>
              {blockOptions(apartmentDraft?.buildingId ?? "").map((blk) => (
                <option key={blk.id} value={blk.id}>
                  {blk.name} ({blk.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor *">
            <select
              className="select"
              value={apartmentDraft?.floorId ?? ""}
              onChange={(e) => setApartmentDraft((d) => (d ? { ...d, floorId: e.target.value } : d))}
            >
              <option value="">Select floor…</option>
              {floorOptions(apartmentDraft?.blockId ?? "").map((fl) => (
                <option key={fl.id} value={fl.id}>
                  Level {fl.number}
                  {fl.label ? ` · ${fl.label}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid cols-2">
            <Field label="Flat number *">
              <input
                className="input mono"
                value={apartmentDraft?.flatNumber ?? ""}
                onChange={(e) => setApartmentDraft((d) => (d ? { ...d, flatNumber: e.target.value } : d))}
                required
                maxLength={40}
              />
            </Field>
            <Field label="Bedrooms">
              <input
                className="input"
                type="number"
                min={0}
                max={20}
                value={apartmentDraft?.bedroomCount ?? ""}
                onChange={(e) => setApartmentDraft((d) => (d ? { ...d, bedroomCount: e.target.value } : d))}
              />
            </Field>
          </div>
          <Field label="Area">
            <input
              className="input"
              value={apartmentDraft?.area ?? ""}
              onChange={(e) => setApartmentDraft((d) => (d ? { ...d, area: e.target.value } : d))}
              placeholder="1200 sqft"
              maxLength={60}
            />
          </Field>
          {formError && <div className="error-text mb">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={confirmDraft !== null}
        title="Confirm removal"
        onClose={() => setConfirmDraft(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setConfirmDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => void runDelete()} disabled={busy}>
              {busy ? "Removing…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="muted">
          Delete <strong>{confirmDraft?.label}</strong>? This is a soft delete and can leave related records
          inactive.
        </p>
      </Modal>
    </>
  );
}
