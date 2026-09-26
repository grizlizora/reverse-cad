// ==============================================================================
// src/math/quick-select.ts — Deterministic In-Place Linear-Time QuickSelect
// ==============================================================================

/**
 * Deterministic In-Place QuickSelect O(N) Algorithm (Hoare Partitioning with Median-of-Three).
 * Finds the k-th smallest element in Float32Array in linear average and worst-case time without heap allocations.
 */
export function quickSelect(arr: Float32Array, k: number): number {
  if (arr.length === 0) return 0;
  let left = 0;
  let right = arr.length - 1;
  k = Math.max(0, Math.min(k, right));

  while (left < right) {
    // Insertion sort for small ranges
    if (right - left < 10) {
      for (let i = left + 1; i <= right; i++) {
        const val = arr[i];
        let j = i - 1;
        while (j >= left && arr[j] > val) {
          arr[j + 1] = arr[j];
          j--;
        }
        arr[j + 1] = val;
      }
      return arr[k];
    }

    // Median-of-three pivot selection
    const mid = (left + right) >> 1;
    if (arr[mid] < arr[left]) { const t = arr[left]; arr[left] = arr[mid]; arr[mid] = t; }
    if (arr[right] < arr[left]) { const t = arr[left]; arr[left] = arr[right]; arr[right] = t; }
    if (arr[right] < arr[mid]) { const t = arr[mid]; arr[mid] = arr[right]; arr[right] = t; }

    const pivot = arr[mid];
    // Place pivot at right
    const tMid = arr[mid]; arr[mid] = arr[right]; arr[right] = tMid;

    let i = left;
    for (let j = left; j < right; j++) {
      if (arr[j] < pivot) {
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        i++;
      }
    }
    const tFinal = arr[i]; arr[i] = arr[right]; arr[right] = tFinal;

    if (i === k) {
      return arr[k];
    } else if (k < i) {
      right = i - 1;
    } else {
      left = i + 1;
    }
  }

  return arr[left];
}
