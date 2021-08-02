# frozen_string_literal: true

require_relative "../helpers/test_helpers"

module CloudCannonJekyllBookshop
  describe SiteData do
    SETUP = begin
      @site = TestHelpers.setup_site({})
    end

    it "should output bookshop site data" do
      output_data = JSON.parse TestHelpers.read_output_file("_cloudcannon/bookshop-site-data.json")

      data_diff = Hashdiff.diff(output_data.dig("site", "data", "labels", 2), {
        "text" => "Data File Three",
      })
      expect(data_diff).must_equal []

      first_post = output_data.dig("site", "posts", 1)
      expect(first_post["date"]).must_match(/2021-01-01 00:00:00/)
      first_post.delete "date" # Skip strict date check due to timezone issues across machines
      collection_diff = Hashdiff.diff(first_post, {
        "draft"         => false,
        "categories"    => [],
        "title"         => "Hello World",
        "image"         => "https://placekitten.com/120/120",
        "slug"          => "hello-world",
        "ext"           => ".md",
        "tags"          => [],
        "excerpt"       => "<h1 id=\"hello-world\">Hello World</h1>\n",
        "content"       => "<h1 id=\"hello-world\">Hello World</h1>\n",
        "url"           => "/posts/2021-01-01-hello-world",
        "relative_path" => "_posts/2021-01-01-hello-world.md",
        "permalink"     => nil,
      })
      expect(collection_diff).must_equal []
    end

    make_my_diffs_pretty!
  end
end