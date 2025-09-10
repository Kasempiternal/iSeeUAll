<script lang="ts">
  import { cn } from "$lib/utils.js";

  type $$Props = {
    class?: string;
    value?: number;
    max?: number;
  };

  let className: $$Props["class"] = undefined;
  export { className as class };
  export let value: $$Props["value"] = 0;
  export let max: $$Props["max"] = 100;

  $: percentage = Math.min(Math.max(((value || 0) / (max || 100)) * 100, 0), 100);
</script>

<div
  class={cn(
    "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
    className
  )}
  {...$$restProps}
>
  <div
    class="h-full bg-primary transition-all duration-300 ease-in-out"
    style="width: {percentage}%"
  />
</div>