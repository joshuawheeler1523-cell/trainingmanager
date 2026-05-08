import { redirect } from "next/navigation";

// Default route /training-planner/[id] redirects to the wizard's current step.
// Each Setup-Rooms-Trainers-Modules-Classes-Calculate-Schedule step lives at
// its own segment so deep-linking works.

type Params = Promise<{ id: string }>;

export default async function ImplementationIndex({ params }: { params: Params }) {
  const { id } = await params;
  redirect(`/training-planner/${id}/setup`);
}
