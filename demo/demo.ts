/* -------------------------------------------------------------------------- */
/*                                   Imports                                  */
/* -------------------------------------------------------------------------- */

import fs   from "fs";
import path from "path";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/* ------------------------------ Primitives -------------------------------- */

type ID   = string;
type Slug = string;

/* ------------------------------ Composites -------------------------------- */

interface User  { id: ID;   name: string; }
interface Post  { id: ID;   slug: Slug;   }

/* -------------------------------------------------------------------------- */
/*                                   Utils                                    */
/* -------------------------------------------------------------------------- */

// #region String helpers
function slugify(text: string): Slug {
  return text.toLowerCase().replace(/\s+/g, "-");
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) + "..." : text;
}
// #endregion

/* -------------------------------------------------------------------------- */
/*                                    API                                     */
/* -------------------------------------------------------------------------- */

async function getUser(id: ID): Promise<User> {
  return { id, name: "Alice" };
}

async function getPost(id: ID): Promise<Post> {
  return { id, slug: "hello-world" };
}