export const NOT_FOUND = "Not found.";
export const NOT_ALLOWED = "Not allowed.";

export function notFound(): never {
  throw new Error(NOT_FOUND);
}

export function notAllowed(): never {
  throw new Error(NOT_ALLOWED);
}
