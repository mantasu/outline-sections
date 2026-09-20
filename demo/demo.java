/* -------------------------------------------------------------------------- */
/*                                   Package                                  */
/* -------------------------------------------------------------------------- */

package com.example.demo;

/* -------------------------------------------------------------------------- */
/*                                   Imports                                  */
/* -------------------------------------------------------------------------- */

import java.util.List;
import java.util.ArrayList;
import java.util.Optional;

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/* ------------------------------ Primitives -------------------------------- */

class Ids {
    static final String DEFAULT_ID = "0";
}

/* ------------------------------ Composites -------------------------------- */

record User(String id, String name) {
}

record Post(String id, String slug) {
}

/* -------------------------------------------------------------------------- */
/* Utils */
/* -------------------------------------------------------------------------- */

class TextUtils {
    // #region String helpers
    static String slugify(String text) {
        return text.toLowerCase().replaceAll("\\s+", "-");
    }

    static String truncate(String text, int limit) {
        return text.length() > limit ? text.substring(0, limit) + "..." : text;
    }
    // #endregion
}

/* -------------------------------------------------------------------------- */
/* API */
/* -------------------------------------------------------------------------- */

class UserService {
    private final List<User> users = new ArrayList<>();

    User getUser(String id) {
        return new User(id, "Alice");
    }

    Optional<Post> getPost(String id) {
        return Optional.of(new Post(id, "hello-world"));
    }
}

/* -------------------------------------------------------------------------- */
/* Runner */
/* -------------------------------------------------------------------------- */

public class Demo {
    public static void main(String[] args) {
        UserService service = new UserService();
        User user = service.getUser(Ids.DEFAULT_ID);
        System.out.println("User: " + user.name());
        System.out.println("Slug: " + TextUtils.slugify("Hello World"));
    }
}
