/* -------------------------------------------------------------------------- */
/*                                   Imports                                  */
/* -------------------------------------------------------------------------- */
#include <string>
#include <vector>
#include <optional>
#include <algorithm>
#include <iostream>

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
/* ------------------------------ Primitives -------------------------------- */
using UserId = std::string;
using Slug   = std::string;

/* ------------------------------ Composites -------------------------------- */
struct User {
    UserId      id;
    std::string name;
};

struct Post {
    UserId      author_id;
    Slug        slug;
    std::string title;
};

/* -------------------------------------------------------------------------- */
/*                                   Utils                                    */
/* -------------------------------------------------------------------------- */
Slug slugify(std::string text) {
    std::transform(text.begin(), text.end(), text.begin(), ::tolower);
    std::replace(text.begin(), text.end(), ' ', '-');
    return text;
}

std::string truncate(const std::string& text, size_t limit) {
    return text.size() > limit ? text.substr(0, limit) + "..." : text;
}

/* -------------------------------------------------------------------------- */
/*                                 Repository                                 */
/* -------------------------------------------------------------------------- */
/* ---------------------------------- Users --------------------------------- */
class UserRepository {
    std::vector<User> store_;
public:
    void save(User u) { store_.push_back(std::move(u)); }
    std::optional<User> find(const UserId& id) const {
        auto it = std::ranges::find_if(store_, [&](const User& u){ return u.id == id; });
        return it != store_.end() ? std::optional(*it) : std::nullopt;
    }
};

/* ---------------------------------- Posts --------------------------------- */
class PostRepository {
    std::vector<Post> store_;
public:
    void save(Post p) { store_.push_back(std::move(p)); }
    std::vector<Post> byAuthor(const UserId& id) const {
        std::vector<Post> out;
        std::ranges::copy_if(store_, std::back_inserter(out),
            [&](const Post& p){ return p.author_id == id; });
        return out;
    }
};

/* -------------------------------------------------------------------------- */
/*                                    Main                                    */
/* -------------------------------------------------------------------------- */
int main() {
    UserRepository users;
    PostRepository posts;

    users.save({ "1", "Alice" });
    posts.save({ "1", slugify("Hello World"), "Hello World" });

    if (auto u = users.find("1"))
        std::cout << "User: " << u->name << "\n";
}