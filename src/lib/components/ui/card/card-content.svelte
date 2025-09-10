<script lang="ts">
  import { cn } from "$lib/utils.js";

  type $$Props = {
    class?: string;
  };

  let className: $$Props["class"] = undefined;
  export { className as class };
</script>

<div
  class={cn("p-6 pt-0", className)}
  {...$$restProps}
>
  <slot />
</div>