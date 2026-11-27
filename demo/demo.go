package main

/* -------------------------------------------------------------------------- */
/*                                  Imports                                   */
/* -------------------------------------------------------------------------- */

import (
	"fmt"
	"strings"
)

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

/* ------------------------------- Primitives ------------------------------- */

type ID string
type Slug string

/* ------------------------------- Composites ------------------------------- */

type User struct {
	ID   ID
	Name string
}

type Post struct {
	ID   ID
	Slug Slug
}

/* -------------------------------------------------------------------------- */
/*                                   Utils                                    */
/* -------------------------------------------------------------------------- */

// #region String helpers
func slugify(text string) Slug {
	return Slug(strings.ReplaceAll(strings.ToLower(text), " ", "-"))
}

func truncate(text string, limit int) string {
	if len(text) > limit {
		return text[:limit] + "..."
	}
	return text
}
// #endregion

/* -------------------------------------------------------------------------- */
/*                                    Main                                    */
/* -------------------------------------------------------------------------- */

func main() {
	fmt.Println(slugify("Hello World"), truncate("Outline Sections", 7))
}
