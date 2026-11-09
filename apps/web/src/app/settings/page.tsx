import { PageHeader } from "@/components/ui";
import { api, getBusinessId } from "@/lib/api";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await api.business(await getBusinessId());
  return (
    <>
      <PageHeader title="Settings" description="Changes apply from the next call." />
      <SettingsForm business={business} />
    </>
  );
}
