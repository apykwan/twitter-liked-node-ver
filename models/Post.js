const db = require("../db")
const { post } = require("../router-api")
const User = require("./User")
const sanitizeHTML = require("sanitize-html")

let Post = function (data, userid, requestedPostId) {
  this.data = data
  this.errors = []
  this.userid = userid
  this.requestedPostId = requestedPostId
}

Post.prototype.cleanUp = function () {
  if (typeof this.data.title != "string") {
    this.data.title = ""
  }
  if (typeof this.data.body != "string") {
    this.data.body = ""
  }

  function leadingZero(x) {
    if (x < 10) {
      return "0" + x
    } else {
      return x
    }
  }

  let date = new Date()
  let day = leadingZero(date.getDate())
  let hours = leadingZero(date.getHours())
  let minutes = leadingZero(date.getMinutes())
  let seconds = leadingZero(date.getSeconds())
  let month = leadingZero(date.getMonth() + 1)
  fullDate = `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}:${seconds}`

  this.data = {
    title: sanitizeHTML(this.data.title.trim(), { allowedTags: [], allowedAttributes: {} }),
    body: sanitizeHTML(this.data.body.trim(), { allowedTags: [], allowedAttributes: {} }),
    createdDate: fullDate,
    author: this.userid
  }
}

Post.prototype.validate = function () {
  if (this.data.title == "") {
    this.errors.push("You must provide a title.")
  }
  if (this.data.body == "") {
    this.errors.push("You must provide post content.")
  }
}

Post.prototype.create = function () {
  return new Promise(async (resolve, reject) => {
    this.cleanUp()
    this.validate()

    if (!this.errors.length) {
      const incoming = {
        title: this.data.title,
        body: this.data.body,
        createdDate: this.data.createdDate,
        author: this.data.author
      }

      const [{ insertId }] = await db.execute(`
        INSERT INTO posts (title, body, author, createdDate) 
        VALUES(?, ?, ?, ?);
      `, [incoming.title, incoming.body, incoming.author, incoming.createdDate])
      resolve(insertId)
    } else {
      reject(this.errors)
    }
  })
}

Post.prototype.update = function () {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(this.requestedPostId, this.userid)
      if (post.isVisitorOwner) {
        // actually update the db
        let status = await this.actuallyUpdate()
        resolve(status)
      } else {
        reject()
      }
    } catch {
      reject()
    }
  })
}

Post.prototype.actuallyUpdate = function () {
  return new Promise(async (resolve, reject) => {
    this.cleanUp()
    this.validate()
    if (!this.errors.length) {
      const incoming = {
        title: this.data.title,
        body: this.data.body,
        requestedPostId: this.requestedPostId
      }

      await db.execute(`
        UPDATE posts SET title = ?, body = ? WHERE _id = ?;
        `, [incoming.title, incoming.body, incoming.requestedPostId]
      )
      resolve("success")
    } else {
      resolve("failure")
    }
  })
}

Post.findSingleById = function (id, visitorId = 0) {
  return new Promise(async function (resolve, reject) {

    let [[post]] = await db.execute(`
      SELECT p.title, p.body, p._id, p.author, p.createdDate, u.username, u.avatar FROM posts p JOIN users u ON p.author = u._id WHERE p._id = ?
      `, [id]
    )

    if (post) {
      post.isVisitorOwner = post.author == visitorId
      resolve(post)
    } else {
      reject()
    }
  })
}

Post.findByAuthorId = async function (authorId) {
  let [posts] = await db.execute(`
    SELECT p.title, p.body, p._id, p.createdDate, u.username, u.avatar FROM posts p JOIN users u ON p.author = u._id WHERE P.author = ? ORDER BY createdDate DESC;
    `, [authorId]
  )
  return posts
}

Post.countPostsByAuthor = function (id) {
  return new Promise(async (resolve, reject) => {
    const [[{ posts }]] = await db.execute(`
      SELECT count(_id) as posts FROM posts WHERE author = ?
      `, [id]
    )
    resolve(posts)
  })
}

Post.delete = function (postIdToDelete, currentUserId) {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(postIdToDelete, currentUserId)
      if (post.isVisitorOwner) {
        await db.execute(`
          DELETE FROM posts WHERE _id = ?
          `, [postIdToDelete]
        )
        resolve()
      } else {
        reject()
      }
    } catch {
      reject()
    }
  })
}

Post.search = function (searchTerm) {
  return new Promise(async (resolve, reject) => {
    if (typeof searchTerm == "string") {
      let [posts] = await db.execute(`
          SELECT p.title, p.body, p._id, p.author, p.createdDate, u.username, u.avatar 
          FROM posts p 
          JOIN users u ON p.author = u._id 
          WHERE MATCH(title, body) AGAINST(?)
        `, [searchTerm]
      )
      resolve(posts)
    } else {
      reject()
    }
  })
}

Post.getFeed = async function (id) {
  let [posts] = await db.execute(`
    SELECT p._id, p.title, p.createdDate, u.username, u.avatar 
    FROM posts p
    JOIN users u ON p.author = u._id
    WHERE p.author IN (
      SELECT followedId 
      FROM follows 
      WHERE authorId = ?
    )
    ORDER BY createdDate DESC;
    `, [id]
  )

  // Return 'posts' instead of [] once you've actually written your query.
  return posts
}

module.exports = Post
