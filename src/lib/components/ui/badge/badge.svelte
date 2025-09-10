<script lang="ts">
  import type { VariantProps } from "class-variance-authority";
  import { badgeVariants } from "./index.js";
  import { cn } from "$lib/utils.js";

  type $$Props = {
    class?: string;
    variant?: VariantProps<typeof badgeVariants>["variant"];
  };

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let variant: $$Props["variant"] = "default";
</script>

<div
  class={cn(badgeVariants({ variant }), className)}
  {...$$restProps}
>
  <slot />
</div>