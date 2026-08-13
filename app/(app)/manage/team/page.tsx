import { redirect } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { Avatar } from "@/components/ui/ListRow";
import { SheetTrigger } from "@/components/ui/Sheet";
import {
  Callout,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  SectionHeader,
  Sunk,
} from "@/components/ui/primitives";
import {
  FamilyForm,
  LevelForm,
  LevelOrder,
  PermissionRow,
  PersonSheetBody,
  RiderForm,
} from "@/components/TeamAdmin";
import { InviteForm, InviteRow } from "@/components/InviteAdmin";
import { requireTab } from "@/lib/guard";
import {
  listFamilies,
  listFamiliesWithRiders,
  listInvites,
  listLevels,
  listTeam,
} from "@/lib/team";
import { ageGroupFor, formatBarnDateFull } from "@/lib/dates";
import { inviteStatus } from "@/lib/invites";
import { barn, featureEnabled } from "@/config/barn";
import type { Role } from "@/lib/types";

export const metadata = { title: "Team" };

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", staff: "Staff", parent: "Parent" };
const ROLE_TONES = { admin: "gold", staff: "forest", parent: "neutral" } as const;

/**
 * The Team panel — people, families and riders, levels.
 *
 * ADMIN ONLY, and gated twice on purpose. `requireTab('/manage')` bounces
 * anyone whose tab bar has no Manage tab, which today is everyone but an
 * admin; the explicit role check below survives that list changing. Neither is
 * the security boundary — the admin-only RLS policies on profiles, families,
 * riders and levels are, and this screen adds no new ones.
 *
 * This slice is deliberately about people who ALREADY have a login (or none at
 * all, in the case of riders). Inviting and provisioning new logins is its own
 * slice, because it touches auth rather than these four tables.
 */
export default async function ManageTeamPage() {
  const role = await requireTab("/manage");
  if (role !== "admin") redirect("/home");

  const [team, families, familiesWithRiders, levels, invites] = await Promise.all([
    listTeam(),
    listFamilies(),
    listFamiliesWithRiders(),
    listLevels(),
    listInvites(),
  ]);

  const admins = team.filter((person) => person.role === "admin").length;
  const levelName = new Map(levels.map((level) => [level.id, level.name]));
  const familyName = new Map(families.map((family) => [family.id, family.name]));

  // An accepted invite has become a person in the People section above; keeping
  // it in the list would show the same human twice, one of them as paperwork.
  const openInvites = invites.filter((invite) => inviteStatus(invite) !== "accepted");

  return (
    <TabPage title="Team" back="/manage">
      {/* ------------------------------------------------------------------ */}
      {/* A — People                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="People" count={`${team.length}`} />

        {admins === 1 && (
          <Callout tone="gold" icon="alert">
            One admin. If that login is ever lost there is nobody left who can restore it —
            worth making a second person an admin before you need to.
          </Callout>
        )}

        {team.length === 0 ? (
          <EmptyState
            title="Nobody has a login yet"
            body={
              featureEnabled("invites")
                ? "Everyone who signs in — Belle, instructors, barn staff and parents — appears here once they've used their invite."
                : "Everyone who signs in — Belle, instructors, barn staff and parents — appears here once their account exists."
            }
          />
        ) : (
          team.map((person) => {
            const name = person.full_name ?? "Unnamed";
            const facts = [person.phone, person.familyName].filter(Boolean).join(" · ");

            return (
              <Card key={person.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-heading leading-snug text-ink">{name}</h3>
                    {facts && <p className="mt-0.5 text-caption text-muted">{facts}</p>}
                  </div>
                  <Chip
                    value={ROLE_LABELS[person.role]}
                    tone={ROLE_TONES[person.role]}
                    icon={person.role === "parent" ? undefined : "check"}
                  />
                </div>

                {/* A parent whose family has never been set can see nothing at
                    all — worth saying on the card, not just in the edit sheet. */}
                {person.role === "parent" && !person.family_id && (
                  <Callout tone="gold" icon="alert">
                    No family linked yet, so this login sees an empty app. Set their family
                    below.
                  </Callout>
                )}

                <PermissionRow person={person} />

                <SheetTrigger label="Edit" title={name}>
                  <PersonSheetBody
                    person={person}
                    families={families}
                    isOnlyAdmin={admins <= 1}
                  />
                </SheetTrigger>
              </Card>
            );
          })
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* A2 — Invites                                                        */}
      {/*                                                                     */}
      {/* Sits directly under People because it is the same list one step     */}
      {/* earlier: someone who will be on it once they've signed up.          */}
      {/* ------------------------------------------------------------------ */}
      {featureEnabled("invites") && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Invites" count={`${openInvites.length}`} />

          {openInvites.length === 0 ? (
            <EmptyState
              title="No invites out"
              body="Invite someone and you get a link to send."
            />
          ) : (
            <Card className="flex flex-col gap-3 p-4">
              {openInvites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  familyName={invite.family_id ? (familyName.get(invite.family_id) ?? null) : null}
                  barnName={barn.name}
                />
              ))}
            </Card>
          )}

          <SheetTrigger label="Invite someone" title="New invite" variant="primary">
            <InviteForm families={families} />
          </SheetTrigger>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* B — Families and riders                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Families & riders" count={`${familiesWithRiders.length}`} />

        {familiesWithRiders.length === 0 ? (
          <EmptyState
            title="No families yet"
            body="Add a family, then its riders. Neither needs a login."
          />
        ) : (
          familiesWithRiders.map((family) => (
            <Card key={family.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-baseline gap-3">
                <h3 className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
                  {family.name}
                </h3>
                <Chip
                  value={
                    family.riders.length === 1 ? "1 rider" : `${family.riders.length} riders`
                  }
                />
              </div>

              {family.notes && <p className="text-caption text-muted">{family.notes}</p>}

              {family.riders.length === 0 ? (
                <p className="text-caption text-muted">
                  No riders on this family yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {family.riders.map((rider) => {
                    const group = ageGroupFor(rider.dob);
                    const level = rider.level_id ? levelName.get(rider.level_id) : null;

                    return (
                      <li key={rider.id}>
                        <Sunk className="flex flex-col gap-2">
                          <p
                            className={`font-display text-heading leading-snug ${
                              rider.active ? "text-ink" : "text-muted"
                            }`}
                          >
                            {rider.name}
                          </p>

                          <ChipRow>
                            {level ? (
                              <Chip label="Level" value={level} />
                            ) : (
                              <Chip value="No level set" icon="alert" tone="gold" />
                            )}
                            {group && <Chip label="Age" value={group} />}
                            {!rider.active && (
                              <Chip value="Not riding" icon="clock" tone="neutral" />
                            )}
                          </ChipRow>

                          {rider.dob && (
                            <p className="text-caption text-muted">
                              Born {formatBarnDateFull(rider.dob)}
                            </p>
                          )}

                          <SheetTrigger label="Edit" title={rider.name}>
                            <RiderForm
                              familyId={family.id}
                              rider={rider}
                              levels={levels}
                            />
                          </SheetTrigger>
                        </Sunk>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-col gap-2">
                <SheetTrigger
                  label="Add a rider"
                  title={`New rider — ${family.name}`}
                  variant="primary"
                >
                  <RiderForm familyId={family.id} levels={levels} />
                </SheetTrigger>
                <SheetTrigger label="Edit family" title={family.name}>
                  <FamilyForm family={family} />
                </SheetTrigger>
              </div>
            </Card>
          ))
        )}

        <SheetTrigger label="Add a family" title="New family" variant="primary">
          <FamilyForm />
        </SheetTrigger>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* C — Levels                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Levels" count={`${levels.length}`} />

        {levels.length === 0 ? (
          <EmptyState
            title="No levels yet"
            body="Intro, Training, First. Levels decide who gets offered a seat."
          />
        ) : (
          /*
           * NAME ON ITS OWN LINE, CONTROLS UNDER IT.
           *
           * These were one row: name, Rename, two nudge arrows. `SheetTrigger`
           * renders a `w-full` button, so in a flex row it claimed the whole
           * line and the arrows took a fixed 92px — which left the name a
           * sliver, and "Intermediate Dressage" arrived clipped to about four
           * characters at 390px and worse at 320px. Truncating the one piece of
           * data on the row to make room for two chrome controls is backwards.
           */
          <ul className="flex flex-col gap-2">
            {levels.map((level, index) => (
              <li
                key={level.id}
                className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3"
              >
                <span className="font-display text-heading leading-snug text-ink">
                  {level.name}
                </span>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <SheetTrigger label="Rename" title={level.name}>
                      <LevelForm level={level} />
                    </SheetTrigger>
                  </div>
                  <LevelOrder
                    level={level}
                    isFirst={index === 0}
                    isLast={index === levels.length - 1}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <SheetTrigger label="Add a level" title="New level" variant="primary">
          <LevelForm />
        </SheetTrigger>
      </section>

      {/* The age-group explainer that used to close this screen is gone. It
          listed the six bands and explained that they are derived from date of
          birth — true, and nobody needed telling twice: the rider form already
          says the date of birth sets the age group, and each rider card shows
          the band it produced. A paragraph of documentation at the foot of a
          working screen is the chatter the design master exists to remove. */}
    </TabPage>
  );
}
