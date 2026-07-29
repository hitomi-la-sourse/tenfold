export function useRouter() {
  return {
    push() {
      window.location.assign(import.meta.env.BASE_URL);
    },
  };
}
