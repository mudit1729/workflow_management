import { toast } from "sonner";

/** Copy text and confirm with a toast. Returns false when the browser refuses. */
export async function copyText(text: string, success = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success, { description: text.length <= 80 ? text : undefined });
    return true;
  } catch {
    toast.error("Could not copy to the clipboard", {
      description: "Your browser blocked it. Select the text and copy it by hand.",
    });
    return false;
  }
}
